"use client";

import dynamic from "next/dynamic";

// The lab renders in the browser only: the film host uses the web renderer.
const BespokeLab = dynamic(() => import("@/bespoke/BespokeLab"), { ssr: false });

export default function Page() {
  return <BespokeLab />;
}
