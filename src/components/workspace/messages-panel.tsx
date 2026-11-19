"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { btnCls, Card, inputCls, labelCls } from "@/components/ui";

type Thread = {
  id: string;
  student_id: string | null;
  parent_id: string | null;
  teacher_id: string | null;
  subject: string | null;
  created_at: string;
};

type Msg = {
  id: string;
  thread_id: string;
  sender_role: string;
  body: string;
  created_at: string;
};

export type MessageIdentity = {
  /** "Teacher" | "Student" | "Parent" | "School" - written to messages.sender_role. */
  senderRole: string;
  teacherId: string | null;
  studentId: string | null;
  parentId: string | null;
};

/** Two-way message threads (message_threads + messages). A thread is
 *  scoped to the people in it: the teacher, the parent and/or the
 *  pupil it is about. Anyone in the thread can reply; starting a
 *  thread needs a subject and a first message. */
export default function MessagesPanel({
  schoolId,
  identity,
  studentOptions,
  studentLabels,
}: {
  schoolId: string;
  identity: MessageIdentity;
  /** Pupils the sender may start a thread about (teacher: their pupils;
   *  parent: their children; student: just themselves). */
  studentOptions: string[];
  studentLabels: Record<string, string>;
}) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [subject, setSubject] = useState("");
  const [aboutStudent, setAboutStudent] = useState("");
  const [firstBody, setFirstBody] = useState("");
  const [reply, setReply] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    let q = supabase
      .from("message_threads")
      .select("*")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false });
    // Scope to threads this person is part of.
    if (identity.teacherId) q = q.eq("teacher_id", identity.teacherId);
    else if (identity.studentId) q = q.eq("student_id", identity.studentId);
    else if (identity.parentId) q = q.eq("parent_id", identity.parentId);
    const { data } = await q;
    setThreads((data as Thread[] | null) ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, identity.teacherId, identity.studentId, identity.parentId]);

  const openThread = async (id: string) => {
    setOpenId(id);
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_id", id)
      .order("created_at");
    setMsgs((data as Msg[] | null) ?? []);
  };

  const startThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !firstBody.trim()) return;
    const { data, error } = await supabase
      .from("message_threads")
      .insert({
        school_id: schoolId,
        student_id: aboutStudent || identity.studentId || null,
        parent_id: identity.parentId || null,
        teacher_id: identity.teacherId || null,
        subject: subject.trim(),
      })
      .select("id")
      .single();
    if (error || !data) {
      setMsg(`Could not start the conversation: ${error?.message ?? "unknown error"}`);
      return;
    }
    const { error: mErr } = await supabase.from("messages").insert({
      thread_id: (data as { id: string }).id,
      sender_role: identity.senderRole,
      body: firstBody.trim(),
    });
    if (mErr) {
      setMsg(`Conversation started, but the first message did not save: ${mErr.message}`);
    } else {
      setMsg("Conversation started.");
    }
    setSubject("");
    setAboutStudent("");
    setFirstBody("");
    load();
  };

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openId || !reply.trim()) return;
    const { error } = await supabase.from("messages").insert({
      thread_id: openId,
      sender_role: identity.senderRole,
      body: reply.trim(),
    });
    if (error) {
      setMsg(`Could not send: ${error.message}`);
      return;
    }
    setReply("");
    openThread(openId);
  };

  const open = threads.find((t) => t.id === openId) ?? null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <h2 className="mb-3 font-semibold">Start a conversation</h2>
        <form onSubmit={startThread} className="space-y-3">
          <div>
            <label className={labelCls}>Subject</label>
            <input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Homework this week" />
          </div>
          {studentOptions.length > 0 && (
            <div>
              <label className={labelCls}>About pupil</label>
              <select className={inputCls} value={aboutStudent} onChange={(e) => setAboutStudent(e.target.value)}>
                <option value="">- General -</option>
                {studentOptions.map((id) => (
                  <option key={id} value={id}>{studentLabels[id] ?? id}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>Message</label>
            <textarea className={inputCls} rows={3} value={firstBody} onChange={(e) => setFirstBody(e.target.value)} />
          </div>
          <button className={btnCls}>Send</button>
        </form>
        {msg && <p className="mt-3 text-sm font-medium text-royal">{msg}</p>}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">My conversations</h2>
        {threads.length === 0 && (
          <p className="text-sm text-slate-500">No conversations yet.</p>
        )}
        <ul className="space-y-2 text-sm">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                className="w-full rounded-lg bg-mist px-3 py-2 text-left hover:bg-sky-50"
                onClick={() => openThread(t.id)}
              >
                <strong>{t.subject ?? "(no subject)"}</strong>
                <span className="block text-xs text-slate-500">
                  {t.student_id ? studentLabels[t.student_id] ?? "" : "General"} ·{" "}
                  {new Date(t.created_at).toLocaleDateString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {open && (
          <div className="mt-4 border-t border-line pt-3">
            <h3 className="font-semibold">{open.subject}</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {msgs.map((m) => (
                <li key={m.id} className="rounded-lg bg-mist px-3 py-2">
                  <span className="text-xs font-semibold text-royal">{m.sender_role}</span>
                  <p>{m.body}</p>
                  <span className="text-xs text-slate-400">
                    {new Date(m.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
              {msgs.length === 0 && <li className="text-slate-400">No messages yet.</li>}
            </ul>
            <form onSubmit={sendReply} className="mt-3 flex gap-2">
              <input
                className={inputCls}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write a reply…"
              />
              <button className={btnCls}>Send</button>
            </form>
          </div>
        )}
      </Card>
    </div>
  );
}
