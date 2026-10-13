import type { Metadata } from "next";
import BespokeLab from "@/bespoke/BespokeLab";

export const metadata: Metadata = { title: "Bespoke lab · OneMotion" };

export default function Page() {
  return <BespokeLab />;
}
