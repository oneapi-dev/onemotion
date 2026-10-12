import type { Metadata } from "next";
import { Lab } from "@/studio/Lab";

export const metadata: Metadata = { title: "Music lab · Motion by OneAPI" };

export default function Page() {
  return <Lab />;
}
