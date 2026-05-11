import "./globals.css";

export const metadata = {
  title: "Endless Drive Garage",
  description: "A seasonal endless driving game with garage progression.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
