"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, KeyRound, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ApiError, api } from "@/lib/api/client";
import { parseCsv, squash, toCsv } from "@/lib/csv";
import { csvBlob, downloadFile, saveBlob } from "@/lib/download";
import { cn } from "@/lib/utils";

interface ImportResult {
  rows: number;
  ok: boolean;
  dry_run: boolean;
  errors: { row: number; column: string | null; message: string }[];
  created: number;
  parents_created: number;
  parents_linked: number;
  credentials: { name: string; email: string; role: string; password: string }[];
  emails_sent: number;
}

interface ImportField { key: string; label: string; required: boolean; hint: string | null }

const KINDS = {
  students: {
    title: "Import students",
    noun: "students",
    help: "Use any spreadsheet saved as CSV: you match its columns to Vidyanexa's fields. Add the father's, mother's or guardian's name, phone and email to create their parent accounts; a parent already in Vidyanexa (same email) is linked, so brothers and sisters share one account.",
    invalidate: ["students", "classes"],
  },
  staff: {
    title: "Import staff",
    noun: "staff accounts",
    help: "Use any spreadsheet saved as CSV: you match its columns to Vidyanexa's fields. Teachers and office staff need a phone; drivers also need a licence number.",
    invalidate: ["users"],
  },
} as const;

/** Other names a school's spreadsheet often uses for a field (compared without spaces, case or punctuation). */
const ALSO: Record<string, string[]> = {
  admission_no: ["admno", "admissionnumber", "regno", "registrationno", "registrationnumber", "srno", "scholarno", "enrollmentno"],
  first_name: ["fname", "studentfirstname", "givenname"],
  last_name: ["lname", "surname", "familyname", "studentlastname"],
  gender: ["sex"],
  date_of_birth: ["dob", "birthdate", "dateofbirthddmmyyyy"],
  admission_date: ["doa", "dateofadmission", "joiningdate", "dateofjoining"],
  class: ["grade", "std", "standard", "classname"],
  section: ["sec", "division", "div"],
  roll_no: ["rollno", "rollnumber", "roll"],
  blood_group: ["blood"],
  address: ["residentialaddress", "homeaddress", "permanentaddress"],
  father_name: ["fathersname", "father", "fatherfullname"],
  father_phone: ["fathermobile", "fathersmobile", "fathersphone", "fathermobileno", "fathercontact", "fatherscontactno"],
  father_email: ["fathersemail", "fatheremailid"],
  mother_name: ["mothersname", "mother", "motherfullname"],
  mother_phone: ["mothermobile", "mothersmobile", "mothersphone", "mothermobileno", "mothercontact", "motherscontactno"],
  mother_email: ["mothersemail", "motheremailid"],
  guardian_name: ["guardian", "guardiansname", "parentname"],
  guardian_phone: ["guardianmobile", "guardiansmobile", "parentphone", "parentmobile", "parentcontact"],
  guardian_email: ["guardiansemail", "parentemail"],
  full_name: ["name", "staffname", "employeename", "teachername"],
  email: ["emailid", "emailaddress", "mail"],
  role: ["staffrole", "type", "usertype"],
  phone: ["mobile", "mobileno", "mobilenumber", "contact", "contactno", "phoneno", "phonenumber"],
  employee_id: ["empid", "empcode", "employeecode", "staffid", "employeeno"],
  designation: ["post", "jobtitle", "position"],
  license_no: ["licenceno", "licensenumber", "dlno", "drivinglicence", "drivinglicense"],
};

const NONE = "__none__";
const memoryKey = (kind: string) => `vidyanexa.import-map.${kind}`;

/** Each field's column in the file: what the person chose last time (when that column is still there), else a match by
 *  name. Unmatched fields stay empty for the person to choose. */
export function guessMapping(kind: string, fields: ImportField[], headers: string[]): Record<string, string> {
  let saved: Record<string, string> = {};
  try { saved = JSON.parse(localStorage.getItem(memoryKey(kind)) ?? "{}"); } catch { /* none saved */ }
  const out: Record<string, string> = {};
  const taken = new Set<string>();
  for (const f of fields) {
    if (saved[f.key] && headers.includes(saved[f.key]) && !taken.has(saved[f.key])) { out[f.key] = saved[f.key]; taken.add(saved[f.key]); continue; }
    const names = new Set([squash(f.key), squash(f.label), ...(ALSO[f.key] ?? [])]);
    const hit = headers.find((h) => !taken.has(h) && names.has(squash(h)));
    if (hit) { out[f.key] = hit; taken.add(hit); }
  }
  return out;
}

export function ImportDialog({ kind, open, onOpenChange }: { kind: keyof typeof KINDS; open: boolean; onOpenChange: (o: boolean) => void }) {
  const k = KINDS[kind];
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; headers: string[]; rows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [check, setCheck] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [sendEmails, setSendEmails] = useState(false);
  const fields = useQuery({
    queryKey: ["transfer", kind, "fields"],
    enabled: open,
    staleTime: Infinity,
    queryFn: async () => (await api<ImportField[]>(`/transfer/${kind}/fields`)).data,
  });
  useEffect(() => {
    if (open) { setFile(null); setMapping({}); setCheck(null); setDone(null); setSendEmails(false); }
  }, [open]);

  const missing = (fields.data ?? []).filter((f) => f.required && !mapping[f.key]);
  // The file rewritten in Vidyanexa's own columns, which the import then checks row by row.
  const mappedCsv = useMemo(() => {
    if (!file || !fields.data) return "";
    const used = fields.data.filter((f) => mapping[f.key]);
    const index = used.map((f) => file.headers.indexOf(mapping[f.key]));
    return toCsv([used.map((f) => f.key), ...file.rows.map((r) => index.map((i) => (r[i] ?? "").trim()))]);
  }, [file, fields.data, mapping]);

  const run = useMutation({
    mutationFn: (dryRun: boolean) => api<ImportResult>(`/transfer/${kind}/import`, { method: "POST", body: { csv: mappedCsv, dry_run: dryRun, send_emails: sendEmails } }),
    onSuccess: ({ data }) => {
      try { localStorage.setItem(memoryKey(kind), JSON.stringify(mapping)); } catch { /* not remembered */ }
      if (data.dry_run) { setCheck(data); return; }
      if (!data.ok) { setCheck(data); toast.error("Nothing was imported: fix the rows below and try again"); return; }
      setDone(data);
      for (const key of k.invalidate) qc.invalidateQueries({ queryKey: [key] });
      toast.success(`${data.created} ${k.noun} imported`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not read the file"),
  });

  async function pick(f: File | undefined) {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) {
      toast.error("Please choose a .csv file", { description: "In Excel: File → Save As → CSV UTF-8 (comma delimited)." });
      return;
    }
    const [head, ...rows] = parseCsv(await f.text());
    if (!head || !rows.length) { toast.error("That file has no rows to import"); return; }
    const headers = head.map((h) => h.trim());
    setFile({ name: f.name, headers, rows });
    setMapping(fields.data ? guessMapping(kind, fields.data, headers) : {});
    setCheck(null);
  }
  // The fields can arrive after the file was chosen.
  useEffect(() => {
    if (file && fields.data && !Object.keys(mapping).length) setMapping(guessMapping(kind, fields.data, file.headers));
  }, [file, fields.data, kind, mapping]);

  const template = async () => {
    try { await downloadFile(`/transfer/${kind}/template`, `${kind}-template.csv`); } catch (e) { toast.error((e as Error).message); }
  };
  const saveLogins = () => done && saveBlob(
    csvBlob(["Name", "Email", "Role", "Temporary password"], done.credentials.map((c) => [c.name, c.email, c.role, c.password])),
    `${kind}-login-details.csv`);
  const choose = (field: string, column: string) => { setMapping((m) => ({ ...m, [field]: column === NONE ? "" : column })); setCheck(null); };
  const sample = (column: string | undefined) => (column && file ? (file.rows[0]?.[file.headers.indexOf(column)] ?? "").trim() : "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{k.title}</DialogTitle>
          <DialogDescription>{k.help}</DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="enter-pop space-y-4 py-2 text-center">
            <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden />
            <p className="font-heading text-xl font-bold">{done.created} {k.noun} imported</p>
            {kind === "students" && <p className="text-sm text-muted-foreground">{done.parents_created} new parent accounts · {done.parents_linked} linked to existing parents</p>}
            {done.credentials.length > 0 && (
              <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 text-left text-sm">
                <p className="flex items-center gap-2 font-semibold"><KeyRound className="size-4" aria-hidden />Login details for {done.credentials.length} new accounts</p>
                <p className="mt-1 text-muted-foreground">
                  {done.emails_sent ? `${done.emails_sent} were emailed their details. ` : "No emails were sent. "}
                  Download the list now: the temporary passwords aren&apos;t shown again. Everyone must choose their own password at first sign-in.
                </p>
                <Button className="mt-3" onClick={saveLogins}><Download aria-hidden />Download login details</Button>
              </div>
            )}
          </div>
        ) : !file ? (
          <div className="space-y-4">
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li><b className="text-foreground">1. Choose your CSV.</b> Any columns, in any order: the first row must be the column names.</li>
              <li><b className="text-foreground">2. Match the columns</b> to Vidyanexa&apos;s fields. Most are matched for you.</li>
              <li><b className="text-foreground">3. Check, then import.</b> Nothing is saved until every row is correct.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="CSV file" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
              <Button onClick={() => input.current?.click()}><Upload aria-hidden />Choose CSV file</Button>
              <Button variant="ghost" onClick={template}><FileSpreadsheet aria-hidden />Or start from our template</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Button variant="ghost" size="sm" onClick={() => { setFile(null); setCheck(null); }}><ArrowLeft aria-hidden />Another file</Button>
              <span className="min-w-0 truncate"><span className="font-medium">{file.name}</span> · {file.rows.length} rows · {file.headers.length} columns</span>
            </div>

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[560px] text-sm">
                <caption className="sr-only">Match the file&apos;s columns to Vidyanexa&apos;s fields</caption>
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-semibold">Vidyanexa field</th>
                    <th scope="col" className="px-3 py-2 text-left font-semibold">Column in your file</th>
                    <th scope="col" className="px-3 py-2 text-left font-semibold">First row</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(fields.data ?? []).map((f) => {
                    const col = mapping[f.key];
                    const gap = f.required && !col;
                    return (
                      <tr key={f.key} className={cn(gap && "bg-destructive/5")}>
                        <td className="px-3 py-2 align-middle">
                          <span className="font-medium">{f.label}</span>{f.required && <span className="text-destructive" aria-label="required">*</span>}
                          {f.hint && <span className="block text-xs text-muted-foreground">{f.hint}</span>}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <Select value={col || NONE} onValueChange={(v) => choose(f.key, String(v))}>
                            <SelectTrigger className={cn("w-full min-w-44", gap && "border-destructive")} aria-label={`Column for ${f.label}`}>
                              <SelectValue>{col || (f.required ? "Choose a column" : "Not in my file")}</SelectValue>
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                              <SelectItem value={NONE}>Not in my file</SelectItem>
                              {file.headers.filter((h) => h).map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="max-w-48 truncate px-3 py-2 align-middle text-muted-foreground">{sample(col) || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {missing.length > 0 && (
              <p className="text-sm text-destructive">Choose a column for: {missing.map((f) => f.label).join(", ")}.</p>
            )}

            {check && (
              <div className={cn("rounded-xl border p-4", check.ok ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5")}>
                {check.ok ? (
                  <p className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    <span>All {check.rows} rows are fine. Ready to add <b>{check.created} {k.noun}</b>
                      {kind === "students" && <> with <b>{check.parents_created}</b> new parent accounts{check.parents_linked ? <> and <b>{check.parents_linked}</b> links to existing parents</> : null}</>}.</span>
                  </p>
                ) : (
                  <>
                    <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive"><AlertTriangle className="size-4" aria-hidden />{check.errors.length} problem{check.errors.length > 1 ? "s" : ""} to fix. Nothing was saved.</p>
                    <div className="max-h-64 overflow-y-auto rounded-lg border bg-card">
                      <table className="w-full text-sm">
                        <caption className="sr-only">Problems in the file</caption>
                        <thead className="sticky top-0 bg-muted text-xs text-muted-foreground"><tr><th scope="col" className="px-3 py-1.5 text-left">Row</th><th scope="col" className="px-3 py-1.5 text-left">Field</th><th scope="col" className="px-3 py-1.5 text-left">Problem</th></tr></thead>
                        <tbody className="divide-y">
                          {check.errors.map((e, i) => {
                            const field = fields.data?.find((f) => f.key === e.column);
                            return (
                              <tr key={i}><td className="px-3 py-1.5 tabular">{e.row + 1}</td><td className="px-3 py-1.5 text-xs">{field ? `${field.label} (${mapping[field.key]})` : (e.column ?? "—")}</td><td className="px-3 py-1.5">{e.message}</td></tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Row numbers match your spreadsheet (row 1 is the column names). Fix the file and choose it again, or change a column above, then check again.</p>
                  </>
                )}
              </div>
            )}

            {check?.ok && (
              <label className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
                <span>Email login details to each new account
                  <span className="block text-xs text-muted-foreground">You can download the details either way. Demo addresses are never emailed.</span>
                </span>
                <Switch checked={sendEmails} onCheckedChange={setSendEmails} />
              </label>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{done ? "Close" : "Cancel"}</Button>
          {file && !done && (
            check?.ok ? (
              <Button onClick={() => run.mutate(false)} loading={run.isPending} loadingText="Importing…"><Upload aria-hidden />Import {check.created} {k.noun}</Button>
            ) : (
              <Button disabled={missing.length > 0 || !fields.data} onClick={() => run.mutate(true)} loading={run.isPending} loadingText="Checking…">Check {file.rows.length} rows</Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Export buttons share this: download with a toast on failure. */
export async function exportCsv(path: string, name: string) {
  try {
    await downloadFile(path, `${name}.csv`);
  } catch (e) {
    toast.error((e as Error).message);
  }
}
