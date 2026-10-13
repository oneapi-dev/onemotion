import type { Metadata } from "next";
import { Lab } from "@/studio/Lab";

export const metadata: Metadata = { title: "Music lab · OneMotion" };

export default function Page() {
  return <Lab />;
}
