"use client";

import { useActionState, useRef, useState } from "react";
import { submitYapAction, type SubmitState } from "@/app/actions";
import { cn } from "@/lib/cn";
import { slugifyTag } from "@/lib/format";
import { useD } from "@/lib/i18n/client";
import { NAME_MAX } from "@/lib/names";
import type { YapperRef } from "@/lib/types";

const NEW_YAPPER = "__new__";

export function YapForm({ yappers }: { yappers: YapperRef[] }) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitYapAction, {});
  const [text, setText] = useState("");
  const [authorId, setAuthorId] = useState("");
  const d = useD();
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function commitTag(raw: string) {
    const slug = slugifyTag(raw);
    if (slug && !tags.includes(slug) && tags.length < 6) setTags([...tags, slug]);
    setTagDraft("");
  }

  return (
    <form action={action} className="border border-ink bg-paper">
      <div className="border-b border-ink px-4 py-3">
        <span className="label-strong">{d.submit.panel}</span>
      </div>

      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <label htmlFor="text" className="label">
          {d.submit.text} <span className="text-red">*</span>
        </label>
        <textarea
          id="text"
          name="text"
          required
          maxLength={400}
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={d.submit.textPlaceholder}
          className={cn(
            "quote mt-2 w-full resize-none border border-ink bg-paper px-3 py-3 outline-none",
            "text-[clamp(1.3rem,3.2vw,2.1rem)] focus:bg-white",
            text.length > 150 && "quote-lower",
          )}
        />
        <div className="mt-1 flex justify-between">
          <span className="label">verbatim, please. context goes below.</span>
          <span className="label tabnums">{text.length}/400</span>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="authorId" className="label">
              {d.submit.author} <span className="text-red">*</span>
            </label>
            <div className="relative mt-2">
              <select
                id="authorId"
                value={authorId}
                onChange={(event) => setAuthorId(event.target.value)}
                className="field appearance-none rounded-none pr-9"
              >
                <option value="" disabled>
                  {d.submit.choose}
                </option>
                {yappers.map((yapper) => (
                  <option key={yapper.id} value={yapper.id}>
                    {yapper.displayName}
                  </option>
                ))}
                <option value={NEW_YAPPER}>{d.submit.addNew}</option>
              </select>
              <span
                aria-hidden
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px]"
              >
                ▾
              </span>
            </div>
            <input
              type="hidden"
              name="authorId"
              value={authorId === NEW_YAPPER ? "" : authorId}
            />
            {authorId === NEW_YAPPER ? (
              <input
                name="authorName"
                placeholder={d.submit.theirName}
                className="field mt-2"
                autoComplete="off"
                autoFocus
                maxLength={NAME_MAX}
              />
            ) : null}
          </div>

          <div>
            <label htmlFor="saidAt" className="label">
              {d.submit.when}
            </label>
            <input
              id="saidAt"
              name="saidAt"
              type="datetime-local"
              className="field mt-2"
              defaultValue={new Date().toISOString().slice(0, 16)}
            />
          </div>
        </div>

        <div className="mt-6">
          <label htmlFor="lore" className="label">
            {d.submit.lore}
          </label>
          <textarea
            id="lore"
            name="lore"
            rows={3}
            maxLength={2000}
            placeholder={d.submit.lorePlaceholder}
            className="field mt-2 resize-y"
          />
          <p className="label mt-1">so this still makes sense in six months.</p>
        </div>

        <div className="mt-6">
          <span className="label">{d.submit.tags}</span>
          <div className="mt-2 flex flex-wrap items-center gap-2 border border-ink px-2 py-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-2 border border-ink bg-paper-2 px-2 py-1 font-mono text-[11px]"
              >
                #{tag}
                <button
                  type="button"
                  onClick={() => setTags(tags.filter((item) => item !== tag))}
                  className="text-muted hover:text-red"
                  aria-label={`Remove ${tag}`}
                >
                  ✕
                </button>
              </span>
            ))}
            <input
              value={tagDraft}
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "," || event.key === " ") {
                  event.preventDefault();
                  commitTag(tagDraft);
                }
                if (event.key === "Backspace" && !tagDraft) setTags(tags.slice(0, -1));
              }}
              onBlur={() => commitTag(tagDraft)}
              placeholder={tags.length >= 6 ? "six is plenty" : "+ add tag"}
              disabled={tags.length >= 6}
              className="min-w-[110px] flex-1 bg-transparent px-1 py-1 font-mono text-[12px] outline-none"
            />
          </div>
          <input type="hidden" name="tags" value={tags.join(",")} />
        </div>

        <div className="mt-6">
          <span className="label">{d.submit.evidence}</span>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <label
              className={cn(
                "flex flex-1 cursor-pointer items-center justify-center border border-dashed border-ink px-4 py-6 text-center transition-colors duration-100 hover:bg-paper-2",
                preview && "sm:flex-none sm:px-6",
              )}
            >
              <input
                ref={fileRef}
                type="file"
                name="evidence"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  setPreview(file ? URL.createObjectURL(file) : null);
                }}
              />
              <span className="label leading-[1.6]">
                Upload image
                <br />
                or drag and drop
              </span>
            </label>

            {preview ? (
              <div className="relative w-full border border-ink sm:w-[180px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="" className="h-[120px] w-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setPreview(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="absolute right-0 top-0 border-b border-l border-ink bg-paper px-2 py-1 font-mono text-[11px] hover:bg-red hover:text-paper"
                  aria-label={d.submit.removeEvidence}
                >
                  ✕
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {state.error ? (
          <p className="mt-6 border border-red bg-red/10 px-3 py-2 font-mono text-[12px] text-red">
            {state.error}
          </p>
        ) : null}

        <button type="submit" disabled={pending} className="btn btn-acid btn-lg mt-6 w-full">
          {pending ? d.submit.archiving : `${d.submit.yapIt} →`}
        </button>
        <p className="label mt-3 text-center">yap responsibly. this is permanent.</p>
      </div>
    </form>
  );
}
