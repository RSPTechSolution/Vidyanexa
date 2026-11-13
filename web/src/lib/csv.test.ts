import { describe, expect, it } from "vitest";
import { guessMapping } from "@/components/common/import-dialog";
import { parseCsv, toCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("reads quoted fields, commas, quotes and line breaks inside them, a BOM and Windows line ends", () => {
    const text = '﻿Name,Address,Note\r\n"Patel, Aarav","12 MG Road\nPune","He said ""hi"""\r\n\r\nDiya,,\r\n';
    expect(parseCsv(text)).toEqual([
      ["Name", "Address", "Note"],
      ["Patel, Aarav", "12 MG Road\nPune", 'He said "hi"'],
      ["Diya", "", ""],
    ]);
  });

  it("round-trips through toCsv", () => {
    const rows = [["a", "b,c"], ['say "x"', "line\nbreak"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("guessMapping", () => {
  const fields = [
    { key: "admission_no", label: "Admission number", required: true, hint: null },
    { key: "date_of_birth", label: "Date of birth", required: true, hint: null },
    { key: "father_phone", label: "Father's phone", required: false, hint: null },
    { key: "roll_no", label: "Roll number", required: false, hint: null },
  ];

  it("matches a school's own column names, and leaves the rest for the person", () => {
    localStorage.clear();
    const m = guessMapping("students", fields, ["Adm No.", "DOB", "Father Mobile", "House"]);
    expect(m).toEqual({ admission_no: "Adm No.", date_of_birth: "DOB", father_phone: "Father Mobile" });
  });

  it("prefers the columns chosen last time, when the file still has them", () => {
    localStorage.setItem("vidyanexa.import-map.students", JSON.stringify({ roll_no: "House", admission_no: "Gone" }));
    const m = guessMapping("students", fields, ["Adm No.", "DOB", "House"]);
    expect(m.roll_no).toBe("House");
    expect(m.admission_no).toBe("Adm No.");
  });
});
