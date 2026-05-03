//! Voice mode audio capture (v0.3.0).
//!
//! Captures mic audio via cpal (WASAPI on Windows) on a dedicated audio
//! thread, then encodes the buffer as a 16-bit PCM WAV when recording
//! stops. The thread-owned design is required because `cpal::Stream` is
//! `!Send` on Windows — the COM apartment that owns the stream must be
//! the same thread that drops it.
//!
//! Public surface is two methods:
//!   `VoiceRecorder::start()` — begin capture (no-op if already recording).
//!   `VoiceRecorder::stop()`  — stop capture, return WAV bytes.
//!
//! Threading: `start()` and `stop()` are sync, blocking calls but each
//! returns within milliseconds. The audio thread itself is long-lived
//! (spawned at app startup) and idles between recordings.
//!
//! Privacy: audio bytes only live in two places:
//!   1. The `Vec<f32>` PCM buffer on the audio thread, dropped after
//!      `stop()` encodes it to WAV.
//!   2. The returned `Vec<u8>` WAV, which the caller (Tauri command) hands
//!      to the React frontend, which uploads and discards.
//! Neither this module nor the worker persist audio to disk.

use std::io::Cursor;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

/// Public-facing handle. Cheap to clone-equivalent — the `Sender<Cmd>` is
/// the only state and channels can be sent across threads. We hold it as
/// Tauri-managed state and call `start`/`stop` from command handlers.
pub struct VoiceRecorder {
    cmd_tx: Sender<Cmd>,
}

enum Cmd {
    Start {
        ack: Sender<Result<(), String>>,
    },
    Stop {
        result: Sender<Result<Vec<u8>, String>>,
    },
}

impl VoiceRecorder {
    /// Spawn the audio worker thread. Call once at app startup.
    pub fn spawn() -> Self {
        let (cmd_tx, cmd_rx) = mpsc::channel();
        thread::spawn(move || worker(cmd_rx));
        Self { cmd_tx }
    }

    /// Start recording. Returns Ok(()) once capture is running, or Err
    /// describing why the device couldn't be opened (no input device,
    /// permission denied, unsupported format, already recording, etc).
    pub fn start(&self) -> Result<(), String> {
        let (tx, rx) = mpsc::channel();
        self.cmd_tx
            .send(Cmd::Start { ack: tx })
            .map_err(|_| "audio worker died".to_string())?;
        rx.recv_timeout(Duration::from_secs(3))
            .map_err(|_| "audio worker timeout".to_string())?
    }

    /// Stop recording and return the captured audio encoded as WAV bytes.
    /// Errors if no recording is in progress, or if encoding fails.
    pub fn stop(&self) -> Result<Vec<u8>, String> {
        let (tx, rx) = mpsc::channel();
        self.cmd_tx
            .send(Cmd::Stop { result: tx })
            .map_err(|_| "audio worker died".to_string())?;
        // Stop can block briefly while we drain the cpal callback and
        // encode the WAV. 10s is generous — a 60s mono 48kHz buffer
        // encodes in well under a second on commodity hardware.
        rx.recv_timeout(Duration::from_secs(10))
            .map_err(|_| "audio worker timeout".to_string())?
    }
}

fn worker(cmd_rx: Receiver<Cmd>) {
    let host = cpal::default_host();

    while let Ok(cmd) = cmd_rx.recv() {
        match cmd {
            Cmd::Stop { result } => {
                // No active recording — caller must've called stop() twice
                // or stop() before start().
                let _ = result.send(Err("not_recording".to_string()));
            }
            Cmd::Start { ack } => {
                match begin_capture(&host) {
                    Ok((stream, samples_handle, sample_rate, channels)) => {
                        // Tell the caller capture is up, then block waiting
                        // for the matching Stop. While blocked, any extra
                        // Start commands get rejected with already_recording.
                        let _ = ack.send(Ok(()));

                        // Inner command loop. The cpal Stream MUST be
                        // dropped on this same thread — that's why we
                        // can't move it elsewhere or yield to async.
                        loop {
                            match cmd_rx.recv() {
                                Err(_) => return, // channel closed, app shutting down
                                Ok(Cmd::Start { ack }) => {
                                    let _ = ack.send(Err("already_recording".to_string()));
                                }
                                Ok(Cmd::Stop { result }) => {
                                    // Pause the stream before reading the
                                    // shared buffer so the callback isn't
                                    // racing us. `pause()` is best-effort —
                                    // some hosts ignore it; dropping the
                                    // stream below is the real stop.
                                    let _ = stream.pause();
                                    drop(stream);

                                    // Move the Vec<f32> out of the shared
                                    // Mutex. Holding the lock during WAV
                                    // encoding is fine here — the callback
                                    // is dead at this point.
                                    let pcm = match samples_handle.lock() {
                                        Ok(mut g) => std::mem::take(&mut *g),
                                        Err(_) => Vec::new(),
                                    };

                                    let wav = encode_wav(&pcm, sample_rate, channels);
                                    let _ = result.send(Ok(wav));
                                    break; // back to outer loop, ready for next Start
                                }
                            }
                        }
                    }
                    Err(e) => {
                        let _ = ack.send(Err(e));
                    }
                }
            }
        }
    }
}

type SamplesHandle = std::sync::Arc<std::sync::Mutex<Vec<f32>>>;

fn begin_capture(
    host: &cpal::Host,
) -> Result<(cpal::Stream, SamplesHandle, u32, u16), String> {
    let device = host
        .default_input_device()
        .ok_or_else(|| "no_input_device".to_string())?;

    let config = device
        .default_input_config()
        .map_err(|e| format!("no_default_config: {e}"))?;

    let sample_rate = config.sample_rate().0;
    let channels = config.channels();
    let sample_format = config.sample_format();
    let stream_config: cpal::StreamConfig = config.into();

    // Pre-size to ~60s of mono 48kHz so we don't allocate during recording.
    // For stereo or higher rates we just take a couple of growths.
    let samples: SamplesHandle = std::sync::Arc::new(std::sync::Mutex::new(
        Vec::with_capacity(60 * 48_000),
    ));

    // We cap the buffer length so a stuck stream can't OOM the app.
    // 90 seconds at 48kHz stereo = 8.64M samples = ~34MB f32. Beyond that,
    // we silently drop the trailing samples — JS-side 60s auto-stop kicks
    // in long before this would ever trigger.
    let max_samples_total = (sample_rate as usize) * (channels as usize) * 90;

    let err_fn = |err| eprintln!("[audio] stream error: {err}");

    // cpal hands us samples in whatever format the device produces. We
    // normalise to f32 [-1.0, 1.0] in the callback so encode_wav doesn't
    // have to care about source format.
    let stream = match sample_format {
        cpal::SampleFormat::F32 => {
            let buf = samples.clone();
            device
                .build_input_stream(
                    &stream_config,
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        push_samples(&buf, data, max_samples_total, |s| *s);
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("stream_build_failed_f32: {e}"))?
        }
        cpal::SampleFormat::I16 => {
            let buf = samples.clone();
            device
                .build_input_stream(
                    &stream_config,
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        push_samples(&buf, data, max_samples_total, |s| {
                            *s as f32 / i16::MAX as f32
                        });
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("stream_build_failed_i16: {e}"))?
        }
        cpal::SampleFormat::U16 => {
            let buf = samples.clone();
            device
                .build_input_stream(
                    &stream_config,
                    move |data: &[u16], _: &cpal::InputCallbackInfo| {
                        push_samples(&buf, data, max_samples_total, |s| {
                            (*s as f32 - 32768.0) / 32768.0
                        });
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("stream_build_failed_u16: {e}"))?
        }
        other => {
            return Err(format!("unsupported_sample_format: {other:?}"));
        }
    };

    stream
        .play()
        .map_err(|e| format!("stream_play_failed: {e}"))?;

    Ok((stream, samples, sample_rate, channels))
}

// Hot-path helper: convert any sample type to f32 and append, respecting
// the global cap. Inlined into the callback by the optimiser.
#[inline]
fn push_samples<T, F>(buf: &SamplesHandle, data: &[T], cap: usize, to_f32: F)
where
    F: Fn(&T) -> f32,
{
    if let Ok(mut guard) = buf.lock() {
        let remaining = cap.saturating_sub(guard.len());
        if remaining == 0 {
            return;
        }
        let take = data.len().min(remaining);
        guard.extend(data[..take].iter().map(to_f32));
    }
}

/// Encode interleaved f32 PCM as a 16-bit PCM WAV. Returned bytes are a
/// complete RIFF file ready to upload.
fn encode_wav(samples: &[f32], sample_rate: u32, channels: u16) -> Vec<u8> {
    let spec = hound::WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut buf: Vec<u8> = Vec::with_capacity(44 + samples.len() * 2);
    {
        let cursor = Cursor::new(&mut buf);
        let mut writer = match hound::WavWriter::new(cursor, spec) {
            Ok(w) => w,
            Err(_) => return Vec::new(),
        };
        for s in samples {
            let clamped = s.clamp(-1.0, 1.0);
            let sample_i16 = (clamped * i16::MAX as f32) as i16;
            if writer.write_sample(sample_i16).is_err() {
                return Vec::new();
            }
        }
        if writer.finalize().is_err() {
            return Vec::new();
        }
    }
    buf
}
