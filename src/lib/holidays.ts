// src/lib/holidays.ts

export interface Holiday {
  name: string;
  date: Date;
}

// Dutch official holidays for 2024 and 2025
export const holidays: Holiday[] = [
  // 2024
  { name: "Nieuwjaarsdag", date: new Date("2024-01-01") },
  { name: "Goede Vrijdag", date: new Date("2024-03-29") },
  { name: "Eerste Paasdag", date: new Date("2024-03-31") },
  { name: "Tweede Paasdag", date: new Date("2024-04-01") },
  { name: "Koningsdag", date: new Date("2024-04-27") },
  { name: "Bevrijdingsdag", date: new Date("2024-05-05") },
  { name: "Hemelvaartsdag", date: new Date("2024-05-09") },
  { name: "Eerste Pinksterdag", date: new Date("2024-05-19") },
  { name: "Tweede Pinksterdag", date: new Date("2024-05-20") },
  { name: "Eerste Kerstdag", date: new Date("2024-12-25") },
  { name: "Tweede Kerstdag", date: new Date("2024-12-26") },

  // 2025
  { name: "Nieuwjaarsdag", date: new Date("2025-01-01") },
  { name: "Goede Vrijdag", date: new Date("2025-04-18") },
  { name: "Eerste Paasdag", date: new Date("2025-04-20") },
  { name: "Tweede Paasdag", date: new Date("2025-04-21") },
  { name: "Koningsdag", date: new Date("2025-04-26") }, // Saturday
  { name: "Bevrijdingsdag", date: new Date("2025-05-05") },
  { name: "Hemelvaartsdag", date: new Date("2025-05-29") },
  { name: "Eerste Pinksterdag", date: new Date("2025-06-08") },
  { name: "Tweede Pinksterdag", date: new Date("2025-06-09") },
  { name: "Eerste Kerstdag", date: new Date("2025-12-25") },
  { name: "Tweede Kerstdag", date: new Date("2025-12-26") },
];
