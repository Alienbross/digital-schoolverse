"use client";

import { useState } from "react";
import { classRegistrationLink } from "@/lib/registration";

/** Copy button for one class registration link. The link is
 *  /<slug>/register/class/<class-id> (migration 0031): the class id
 *  is itself the token, and the page shows that class only. Share it
 *  with a new pupil who is not in the school's uploaded file. */
export default function ClassRegistrationLinkButton({
  slug,
  classId,
  className,
}: {
  slug: string;
  classId: string;
  className: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const url = classRegistrationLink(window.location.origin, slug, classId);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard blocked (older browser, no permission): fall back
      // to a prompt the user can copy from.
      window.prompt(`Copy the registration link for ${className}:`, url);
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy the registration link for ${className} - share it with a new pupil`}
      className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-royal hover:border-royal"
    >
      {copied ? "Link copied ✓" : "Copy registration link"}
    </button>
  );
}
