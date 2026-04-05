/**
 * Purpose: Root App Router layout for the ClawaaS frontend.
 * TODO: Add shared navigation, auth session wiring, and global styles.
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "ClawaaS",
  description: "Claw as a Service demo UI",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
