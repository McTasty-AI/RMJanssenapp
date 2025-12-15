

import { z } from "zod";
import { tollOptions, leaveTypes, finePaidByOptions, billingTypes, surchargeOptions, mileageRateTypes, employmentTypes, weekDays, salaryScaleGroups, salaryScaleSteps } from "./types";
import { addDays } from 'date-fns';

export const loginSchema = z.object({
  email: z.string().email({ message: "Voer een geldig emailadres in." }),
  password: z.string().min(1, { message: "Wachtwoord is verplicht." }),
});

const baseUserSchema = z.object({
  firstName: z.string().min(1, { message: "Voornaam is verplicht." }),
  lastName: z.string().min(1, { message: "Achternaam is verplicht." }),
  email: z.string().email({ message: "Voer een geldig emailadres in." }),
  role: z.enum(['user', 'admin']).optional(),
  salaryScaleGroup: z.enum(salaryScaleGroups).optional().nullable(),
  salaryScaleStep: z.coerce.number().optional().nullable(),
  employmentType: z.enum(employmentTypes).optional(),
  contractHours: z.coerce.number().optional(),
  assignedLicensePlates: z.array(z.string()).optional(),
  workDays: z.array(z.enum(weekDays)).optional(),
  // Travel Allowance
  homeStreet: z.string().optional(),
  homeHouseNumber: z.string().optional(),
  homePostalCode: z.string().optional(),
  homeCity: z.string().optional(),
  station: z.string().optional(),
  hasTravelAllowance: z.boolean().optional(),
  travelDistance: z.coerce.number().optional(),
  travelAllowanceRate: z.coerce.number().optional(),
  overnightAllowanceRate: z.coerce.number().optional(),
});

export const signUpSchema = baseUserSchema.extend({
  password: z.string().min(6, { message: "Wachtwoord moet minimaal 6 tekens lang zijn." }),
  confirmPassword: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Wachtwoorden komen niet overeen.",
    path: ["confirmPassword"],
});


export const updateUserSchema = baseUserSchema.extend({
    password: z.string().min(6, { message: "Wachtwoord moet minimaal 6 tekens lang zijn." }).optional().or(z.literal('')),
    confirmPassword: z.string().optional(),
}).refine((data) => {
    // This refine is for password confirmation
    if (data.password && data.password.length > 0) {
        return data.password === data.confirmPassword;
    }
    return true;
}, {
    message: "Wachtwoorden komen niet overeen.",
    path: ["confirmPassword"],
}).superRefine((data, ctx) => {
    // This superRefine is for workdays and contract hours
    if (data.workDays && data.workDays.length > 0 && data.contractHours !== undefined) {
        const expectedHours = data.workDays.length * 8;
        if (data.contractHours !== expectedHours) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Aantal uren (${data.contractHours}) komt niet overeen met ${data.workDays.length} geselecteerde dagen (${expectedHours} uur).`,
                path: ["contractHours"],
            });
        }
    }
    if (data.hasTravelAllowance) {
      if (!data.homeStreet) ctx.addIssue({ code: 'custom', message: 'Straat is verplicht.', path: ['homeStreet']});
      if (!data.homeHouseNumber) ctx.addIssue({ code: 'custom', message: 'Nr is verplicht.', path: ['homeHouseNumber']});
      if (!data.homePostalCode) ctx.addIssue({ code: 'custom', message: 'Postcode is verplicht.', path: ['homePostalCode']});
      if (!data.homeCity) ctx.addIssue({ code: 'custom', message: 'Stad is verplicht.', path: ['homeCity']});
      if (!data.station) ctx.addIssue({ code: 'custom', message: 'Standplaats is verplicht.', path: ['station']});
      if ((data.travelDistance ?? 0) <= 0) ctx.addIssue({ code: 'custom', message: 'Afstand moet groter dan 0 zijn.', path: ['travelDistance']});
      if ((data.travelAllowanceRate ?? 0) <= 0) ctx.addIssue({ code: 'custom', message: 'Tarief moet groter dan 0 zijn.', path: ['travelAllowanceRate']});
    }
    if (data.overnightAllowanceRate !== undefined && data.overnightAllowanceRate < 0) {
        ctx.addIssue({ code: 'custom', message: 'Overnachtingsvergoeding kan niet negatief zijn.', path: ['overnightAllowanceRate']});
    }
});


const timeSchema = z.object({
    hour: z.coerce.number().min(0).max(24),
    minute: z.coerce.number().refine(val => [0, 15, 30, 45].includes(val)),
});

const breakTimeSchema = z.object({
    hour: z.coerce.number(),
    minute: z.coerce.number(),
});

export const dailyLogSchema = z.object({
  date: z.string(),
  day: z.string(),
  status: z.enum(["gewerkt", "ziek", "vrij", "ouderschapsverlof", "weekend", "feestdag", "atv", "persoonlijk", "onbetaald"]),
  startTime: timeSchema,
  endTime: timeSchema,
  breakTime: breakTimeSchema,
  startMileage: z.coerce.number().min(0, "Kilometerstand mag niet negatief zijn.").optional(),
  endMileage: z.coerce.number().min(0, "Kilometerstand mag niet negatief zijn.").optional(),
  toll: z.enum(tollOptions),
  licensePlate: z.string().optional(),
  overnightStay: z.boolean().optional(),
  tripNumber: z.string().optional(),
}).superRefine((data, ctx) => {
    if (data.status === 'gewerkt') {
        if (!data.licensePlate) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Kenteken is verplicht.",
                path: ["licensePlate"],
            });
        }
        
        const startTotalMinutes = data.startTime.hour * 60 + data.startTime.minute;
        const endTotalMinutes = data.endTime.hour * 60 + data.endTime.minute;
        const breakTotalMinutes = data.breakTime.hour * 60 + data.breakTime.minute;
        const workTotalMinutes = endTotalMinutes - startTotalMinutes;

        if (startTotalMinutes === 0 && endTotalMinutes === 0) {
             ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Tijd is verplicht.",
                path: ["startTime"],
            });
        } else if (endTotalMinutes <= startTotalMinutes) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Eindtijd moet na starttijd zijn.",
                path: ["endTime"],
            });
        }
        
        if (breakTotalMinutes > workTotalMinutes) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Pauze kan niet langer zijn dan de werktijd.",
                path: ["breakTime"],
            });
        }
        
        if (data.startMileage === undefined || data.startMileage === null) {
            ctx.addIssue({ code: 'custom', message: 'Verplicht.', path: ['startMileage'] });
        }
        if (data.endMileage === undefined || data.endMileage === null) {
            ctx.addIssue({ code: 'custom', message: 'Verplicht.', path: ['endMileage'] });
        }

        if (data.startMileage !== undefined && data.endMileage !== undefined && data.endMileage < data.startMileage) {
            ctx.addIssue({ code: 'custom', message: 'Eindstand moet hoger zijn dan beginstand.', path: ['endMileage'] });
        }
    }
});


export const weeklyLogSchema = z.object({
  weekId: z.string(),
  userId: z.string(), // This was the missing field
  days: z.array(dailyLogSchema),
  remarks: z.string().optional(),
  status: z.enum(['concept', 'pending', 'approved']),
  submitted: z.boolean().optional(),
  submittedAt: z.string().optional().nullable(),
});

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];

export const declarationSchema = z.object({
  date: z.date({
    required_error: "Een datum is verplicht.",
  }),
  amount: z.coerce
    .number({ invalid_type_error: "Voer een geldig bedrag in." })
    .positive({ message: "Bedrag moet positief zijn." }),
  reason: z.string().min(3, { message: "Reden moet minimaal 3 tekens lang zijn." }),
  receipt: z
    .any()
    .refine((files) => files?.length == 1, "Een bonnetje is verplicht.")
    .refine((files) => files?.[0]?.size <= MAX_FILE_SIZE, `Maximale bestandsgrootte is 5MB.`)
    .refine(
      (files) => ACCEPTED_IMAGE_TYPES.includes(files?.[0]?.type),
      "Alleen .jpg, .jpeg, .png, .webp en .pdf bestanden worden geaccepteerd."
    ).optional(), // Make the receipt optional in the schema
    isToll: z.boolean().optional(),
});

export const leaveRequestSchema = z.object({
  type: z.enum(leaveTypes),
  dateRange: z.object({
      from: z.date().optional(),
      to: z.date().optional()
  }).refine(data => data.from && data.to, {
      message: 'Een begin- en einddatum is verplicht.',
      path: ['from']
  }),
  reason: z.string().optional(),
});

export const fineSchema = z.object({
    userId: z.string().min(1, { message: "Een gebruiker is verplicht." }),
    date: z.date({
        required_error: "Een datum is verplicht.",
    }),
    amount: z.coerce.number().positive({ message: "Bedrag moet positief zijn." }),
    reason: z.string().min(5, { message: "Reden moet minimaal 5 tekens bevatten." }),
    paidBy: z.enum(finePaidByOptions, {
        required_error: "Selecteer wie de boete betaalt.",
    }),
    licensePlate: z.string().optional(),
    receipt: z
    .any()
    .refine((files) => {
        // This validation is now optional, so it passes if no file is provided.
        if (!files || files.length === 0) {
            return true;
        }
        return files.length === 1;
    }, "Er kan maar één bestand worden geüpload.")
    .refine((files) => {
        if (!files || files.length === 0) return true; // Optional, so pass if empty
        return files[0]?.size <= MAX_FILE_SIZE;
    }, `Maximale bestandsgrootte is 5MB.`)
    .refine((files) => {
        if (!files || files.length === 0) return true; // Optional, so pass if empty
        return ACCEPTED_IMAGE_TYPES.includes(files[0]?.type);
    }, "Alleen .jpg, .jpeg, .png, .webp en .pdf bestanden worden geaccepteerd.")
    .optional(),
});

export const customerSchema = z.object({
  companyName: z.string().min(2, { message: "Bedrijfsnaam is verplicht." }),
  kvkNumber: z.string().length(8, { message: "KVK-nummer moet 8 cijfers zijn." }).regex(/^\d+$/, { message: "Alleen cijfers toegestaan."}),
  street: z.string().min(2, { message: "Straat is verplicht." }),
  houseNumber: z.string().min(1, { message: "Huisnummer is verplicht." }),
  postalCode: z.string().min(6, { message: "Postcode is verplicht." }).max(7),
  city: z.string().min(2, { message: "Stad is verplicht." }),
  contactName: z.string().optional(),
  contactEmail: z.string().email({ message: "Voer een geldig emailadres in." }).optional().or(z.literal('')),
  assignedLicensePlates: z.array(z.string()).optional(),
  paymentTerm: z.coerce.number().min(0, "Betaaltermijn mag niet negatief zijn").optional(),
  showDailyTotals: z.boolean().optional(),
  showWeeklyTotals: z.boolean().optional(),
  showWorkTimes: z.boolean().optional(),

  // Financial details
  billingType: z.enum(billingTypes).optional(),
  mileageRateType: z.enum(mileageRateTypes).optional(),
  hourlyRate: z.coerce.number().min(0, "Tarief mag niet negatief zijn").optional(),
  mileageRate: z.coerce.number().min(0, "Tarief mag niet negatief zijn").optional(),
  overnightRate: z.coerce.number().min(0, "Tarief mag niet negatief zijn").optional(),
  dailyExpenseAllowance: z.coerce.number().min(0, "Vergoeding mag niet negatief zijn").optional(),
  saturdaySurcharge: z.coerce.number().optional(),
  sundaySurcharge: z.coerce.number().optional(),
}).superRefine((data, ctx) => {
    if (data.billingType === 'hourly' || data.billingType === 'combined') {
        if (!data.hourlyRate && data.hourlyRate !== 0) {
            ctx.addIssue({ code: 'custom', message: 'Uurtarief is verplicht.', path: ['hourlyRate']});
        }
    }
    if ((data.billingType === 'mileage' || data.billingType === 'combined') && (data.mileageRateType === 'fixed' || data.mileageRateType === 'dot')) {
        if (!data.mileageRate && data.mileageRate !== 0) {
            ctx.addIssue({ code: 'custom', message: 'Basiskilometertarief is verplicht voor dit type.', path: ['mileageRate']});
        }
    }
});

export const invoiceLineSchema = z.object({
  quantity: z.coerce.number().default(1),
  description: z.string().min(1, 'Omschrijving is verplicht'),
  unitPrice: z.coerce.number({invalid_type_error: "Tarief moet een getal zijn."}).default(0),
  vatRate: z.coerce.number().default(21),
  total: z.coerce.number().default(0),
});

export const invoiceFormSchema = z.object({
  customerId: z.string().min(1, 'Klant is verplicht'),
  userId: z.string().optional(),
  weekId: z.string().optional(),
  customer: z.object({
    companyName: z.string().min(1, "Bedrijfsnaam is verplicht"),
    street: z.string().min(1, "Straat is verplicht"),
    houseNumber: z.string().min(1, "Huisnummer is verplicht"),
    postalCode: z.string().min(1, "Postcode is verplicht"),
    city: z.string().min(1, "Stad is verplicht"),
    kvkNumber: z.string().optional(),
    contactName: z.string().optional(),
  }),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.date(),
  dueDate: z.date(),
  reference: z.string().optional(),
  lines: z.array(invoiceLineSchema),
  footerText: z.string().optional(),
  showDailyTotals: z.boolean().optional(),
  showWeeklyTotals: z.boolean().optional(),
  showWorkTimes: z.boolean().optional(),
});

export const companyProfileSchema = z.object({
  companyName: z.string().min(1, { message: "Bedrijfsnaam is verplicht." }),
  street: z.string().min(1, { message: "Straat is verplicht." }),
  houseNumber: z.string().min(1, { message: "Huisnummer is verplicht." }),
  postalCode: z.string().min(1, { message: "Postcode is verplicht." }),
  city: z.string().min(1, { message: "Stad is verplicht." }),
  email: z.string().email({ message: "Een geldig e-mailadres is verplicht." }),
  phone: z.string().min(1, { message: "Telefoonnummer is verplicht." }),
  kvkNumber: z.string().min(1, { message: "KVK-nummer is verplicht." }),
  vatNumber: z.string().min(1, { message: "BTW-nummer is verplicht." }),
  iban: z.string().min(1, { message: "IBAN is verplicht." }),
  logoUrl: z.string().url({ message: "Voer een geldige URL in." }).optional().or(z.literal('')),
});

export const supplierSchema = z.object({
  companyName: z.string().min(2, { message: "Bedrijfsnaam is verplicht." }),
  kvkNumber: z.string().optional(),
  vatNumber: z.string().optional(),
  street: z.string().optional(),
  houseNumber: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  iban: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email({ message: "Voer een geldig emailadres in." }).optional().or(z.literal('')),
});

export const vehicleSchema = z.object({
  licensePlate: z.string().min(1, "Kenteken is verplicht."),
  make: z.string(),
  model: z.string(),
  status: z.string().min(1, "Status is verplicht."),
  purchaseValue: z.coerce.number().optional(),
  purchaseDate: z.date().optional().nullable(),
  monthlyLeaseAmount: z.coerce.number().optional(),
  outstandingDepreciation: z.coerce.number().optional(),
});

export type CompanyProfileFormData = z.infer<typeof companyProfileSchema>;
export type InvoiceFormData = z.infer<typeof invoiceFormSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;
export type SignUpFormData = z.infer<typeof signUpSchema>;
export type UpdateUserFormData = z.infer<typeof updateUserSchema>;
export type WeeklyLogFormData = z.infer<typeof weeklyLogSchema>;
export type DeclarationFormData = z.infer<typeof declarationSchema>;
export type LeaveRequestFormData = z.infer<typeof leaveRequestSchema>;
export type FineFormData = z.infer<typeof fineSchema>;
export type CustomerFormData = z.infer<typeof customerSchema>;
export type SupplierFormData = z.infer<typeof supplierSchema>;
export type VehicleFormData = z.infer<typeof vehicleSchema>;
