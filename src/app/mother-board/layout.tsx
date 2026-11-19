import type { ReactNode } from "react";
import { RequireOwner } from "@/components/require-role";
import { ConfigBanner, PageHeader } from "@/components/ui";

export default function MotherBoardLayout({ children }: { children: ReactNode }) {
  return (
    <RequireOwner>
      <ConfigBanner />
      <PageHeader
        title="Mother Board"
        sub="Platform owner - full control over every school, login and plan on Digital SchoolVerse."
      />
      {children}
    </RequireOwner>
  );
}
