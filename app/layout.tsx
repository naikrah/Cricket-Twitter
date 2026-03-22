import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CricTweet — Live Cricket Social Automation',
  description: 'Real-time AI cricket commentary for X/Twitter',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
