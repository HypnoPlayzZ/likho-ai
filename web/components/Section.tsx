"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";

// Wrapper for scroll-triggered fade-up animation. Each section that uses
// this animates in when 25% visible and stays animated (once: true) so
// it doesn't re-trigger as the user scrolls back and forth.
export function Section({
  children,
  className = "",
  delay = 0,
  ...rest
}: { children: ReactNode; delay?: number } & HTMLMotionProps<"section">) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.5, ease: "easeOut", delay }}
      className={className}
      {...rest}
    >
      {children}
    </motion.section>
  );
}
