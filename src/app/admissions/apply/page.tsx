"use client";

import { useState } from "react";
import AdmissionsApply from "@/components/admissions-apply";
import { btnCls, Card, ConfigBanner, inputCls, labelCls, PageHeader } from "@/components/ui";

/** /admissions/apply - public apply form without a school in the
 *  URL. Asks for the school's short name (the slug in its portal
 *  address, e.g. greenfield-academy), then shows that school's form.
 *  The school-path form /<slug>/admissions/apply skips this step. */
export default function AdmissionsApplyPlain() {
  const [slugInput, setSlugInput] = useState("");
  const [slug, setSlug] = useState("");

  if (slug) return <AdmissionsApply key={slug} slug={slug} />;

  return (
    <div>
      <ConfigBanner />
      <PageHeader title="Apply for admission" sub="Choose the school you are applying to." />
      <div className="max-w-md">
        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const s = slugInput.trim().toLowerCase();
              if (s) setSlug(s);
            }}
            className="space-y-3"
          >
            <div>
              <label className={labelCls}>School short name</label>
              <input
                className={inputCls}
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value)}
                placeholder="e.g. greenfield-academy"
              />
            </div>
            <button className={btnCls}>Open the application form</button>
          </form>
          <p className="mt-3 text-xs text-slate-400">
            The short name is the part after digital-schoolverse.vercel.app/ in the school&apos;s portal address. The school admin can share the direct link - it looks like digital-schoolverse.vercel.app/greenfield-academy/admissions/apply.
          </p>
        </Card>
      </div>
    </div>
  );
}
