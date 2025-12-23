

export type DayStatus = "gewerkt" | "ziek" | "vrij" | "ouderschapsverlof" | "weekend" | "feestdag" | "atv" | "persoonlijk" | "onbetaald" | "cursus";

export const statusTranslations: Record<DayStatus, string> = {
  gewerkt: "Gewerkt",
  ziek: "Ziek",
  vrij: "Vakantie",
  ouderschapsverlof: "Ouderschapsverlof",
  weekend: "Weekend",
  feestdag: "Feestdag",
  atv: "ATV",
  persoonlijk: "Persoonlijk Verlof",
  onbetaald: "Onbetaald Verlof",
  cursus: "Cursus",
};

export const tollOptions = ["Geen", "BE", "DE", "FR", "CH", "AT", "BE/DE"] as const;
export type Toll = typeof tollOptions[number];

export interface Time {
    hour: number;
    minute: number;
}

export interface DailyLog {
  date: string;
  day: string;
  status: DayStatus;
  startTime: Time;
  endTime: Time;
  breakTime: Time;
  startMileage?: number;
  endMileage?: number;
  toll: Toll;
  licensePlate?: string; // Changed from enum to string
  overnightStay?: boolean;
  tripNumber?: string;
}

export type WeeklyLogStatus = 'concept' | 'pending' | 'approved';

export interface WeeklyLog {
  weekId: string; // e.g., "2024-28"
  userId: string;
  days: DailyLog[];
  remarks?: string;
  status: WeeklyLogStatus;
  submitted?: boolean; // Deprecated, replaced by status
  submittedAt?: string; // ISO String, only when status is 'pending' or 'approved'
  yearMonth?: string; // e.g., "2024-07" for querying
}

export type UserRole = 'admin' | 'user';

export type UserStatus = 'active' | 'inactive';

export const employmentTypes = ["fulltime", "parttime", "oproep", "onbepaalde tijd", "dga"] as const;
export type EmploymentType = typeof employmentTypes[number];

export const employmentTypeTranslations: Record<EmploymentType, string> = {
    fulltime: "Full-time",
    parttime: "Part-time",
    oproep: "Oproepbasis",
    "onbepaalde tijd": "Onbepaalde Tijd",
    dga: "DGA",
};

export const weekDays = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag'] as const;
export type WeekDay = typeof weekDays[number];

export const salaryScaleGroups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export type SalaryScaleGroup = typeof salaryScaleGroups[number];

export const salaryScaleSteps = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type SalaryScaleStep = typeof salaryScaleSteps[number];


export interface User {
    uid?: string; // Firebase Auth UID
    firstName: string;
    lastName: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    assignedLicensePlates?: string[]; // Changed from enum to string array
    // New fields
    salaryScaleGroup?: SalaryScaleGroup;
    salaryScaleStep?: SalaryScaleStep;
    employmentType?: EmploymentType;
    contractHours?: number;
    workDays?: WeekDay[];
    // Travel allowance fields
    homeStreet?: string;
    homeHouseNumber?: string;
    homePostalCode?: string;
    homeCity?: string;
    station?: string;
    hasTravelAllowance?: boolean;
    travelDistance?: number; // one-way in km
    travelAllowanceRate?: number; // per km
    overnightAllowanceRate?: number; // per overnight stay
}

export type DeclarationStatus = "pending" | "approved" | "rejected" | "paid";

export const declarationStatusTranslations: Record<DeclarationStatus, string> = {
  pending: "Ingediend",
  approved: "Goedgekeurd",
  rejected: "Afgekeurd",
  paid: "Uitbetaald",
};

export interface Declaration {
    id: string;
    userId: string;
    userFirstName: string;
    userLastName: string;
    userEmail: string;
    date: string; // ISO string
    amount: number;
    reason: string;
    receiptUrl: string; // URL to the uploaded file in Firebase Storage
    status: DeclarationStatus;
    submittedAt: string; // ISO string
    rejectionReason?: string; // Reason for rejection, only if status is 'rejected'
    isToll?: boolean;
}

export const leaveTypes = ["vakantie", "atv", "persoonlijk", "onbetaald"] as const;
export type LeaveType = typeof leaveTypes[number];

export type LeaveStatus = "pending" | "approved" | "rejected";

export const leaveStatusTranslations: Record<LeaveStatus, string> = {
  pending: "In behandeling",
  approved: "Goedgekeurd",
  rejected: "Afgekeurd",
};

export const leaveTypeTranslations: Record<LeaveType, string> = {
  vakantie: "Vakantie",
  atv: "ATV",
  persoonlijk: "Persoonlijk verlof",
  onbetaald: "Onbetaald verlof",
};


export interface LeaveRequest {
  id: string;
  userId: string;
  userFirstName: string;
  userLastName: string;
  userEmail: string;
  startDate: string; // ISO string
  endDate: string; // ISO string
  type: LeaveType;
  reason?: string;
  status: LeaveStatus;
  submittedAt: string; // ISO string
  rejectionReason?: string;
}

export const finePaidByOptions = ["company", "driver"] as const;
export type FinePaidBy = typeof finePaidByOptions[number];

export const finePaidByTranslations: Record<FinePaidBy, string> = {
    company: "Betaald door R&M Janssen",
    driver: "Eigen rekening chauffeur",
};

export interface Fine {
    id: string;
    userId: string;
    userFirstName: string;
    userLastName: string;
    date: string; // ISO string of the fine date
    amount: number;
    reason: string;
    paidBy: FinePaidBy;
    receiptUrl?: string; // URL to the uploaded fine image
    licensePlate?: string; // Changed from enum to string
    createdAt: string; // ISO string
}

export const billingTypes = ['hourly', 'mileage', 'combined'] as const;
export type BillingType = typeof billingTypes[number];

export const billingTypeTranslations: Record<BillingType, string> = {
    hourly: 'Uurtarief',
    mileage: 'Kilometertarief',
    combined: 'Gecombineerd (Uur & Kilometer)',
};

export const mileageRateTypes = ['fixed', 'variable', 'dot'] as const;
export type MileageRateType = typeof mileageRateTypes[number];
export const mileageRateTypeTranslations: Record<MileageRateType, string> = {
    fixed: 'Vast tarief (eenmalig ingesteld)',
    variable: 'Variabel tarief (wekelijks invoeren)',
    dot: 'Wekelijks DOT %',
};


export const surchargeOptions = [100, 110, 120, 130, 140, 150] as const;
export type SurchargePercentage = typeof surchargeOptions[number];

export interface Customer {
    id: string; // Firestore document ID
    companyName: string;
    kvkNumber: string;
    street: string;
    houseNumber: string;
    postalCode: string;
    city: string;
    contactName?: string;
    contactEmail?: string;
    assignedLicensePlates?: string[]; // Changed from enum to string array
    createdAt: string; // ISO string
    paymentTerm?: number; // Payment term in days
    showDailyTotals?: boolean;
    showWeeklyTotals?: boolean;
    showWorkTimes?: boolean;
    
    // Financial details
    billingType?: BillingType;
    mileageRateType?: MileageRateType;
    hourlyRate?: number;
    mileageRate?: number; // Base rate
    overnightRate?: number;
    dailyExpenseAllowance?: number;
    saturdaySurcharge?: SurchargePercentage;
    sundaySurcharge?: SurchargePercentage;
}

export type InvoiceStatus = 'concept' | 'open' | 'paid';
export type InvoiceStatusExtended = InvoiceStatus | 'overdue' | 'all' | 'credit';

export const invoiceStatusTranslations: Record<InvoiceStatusExtended, string> = {
    concept: 'Concept',
    open: 'Openstaand',
    paid: 'Betaald',
    overdue: 'Verlopen',
    all: 'Alle',
    credit: 'Credit'
};

export interface InvoiceLine {
  quantity: number;
  description: string;
  unitPrice: number;
  vatRate: number;
  total: number;
  licensePlate?: string;
}

export interface InvoiceCustomer {
    companyName: string;
    kvkNumber?: string;
    street: string;
    houseNumber: string;
    postalCode: string;
    city: string;
    contactName?: string;
}

export interface Invoice {
    id: string; // Firestore ID
    invoiceNumber: string;
    status: InvoiceStatus;
    customer: InvoiceCustomer;
    invoiceDate: string; // ISO string
    dueDate: string; // ISO string
    reference?: string;
    lines: InvoiceLine[];
    subTotal: number;
    vatTotal: number;
    grandTotal: number;
    createdAt: string; // ISO string
    footerText?: string;
    showDailyTotals?: boolean;
    showWeeklyTotals?: boolean;
    showWorkTimes?: boolean;
}

export interface CompanyProfile {
    companyName: string;
    street: string;
    houseNumber: string;
    postalCode: string;
    city: string;
    email: string;
    phone: string;
    kvkNumber: string;
    vatNumber: string;
    iban: string;
    logoUrl: string;
}

export interface TollEntry {
    id: string;
    country: string;       // Land-code of naam
    licensePlate: string;  // Kenteken
    usageDate: string;     // ISO datum (YYYY-MM-DD)
    usageTime?: string;    // Optioneel tijdstip (HH:mm) voor betere uniekheid
    amount: number;        // Exclusief BTW
    vatRate: number;       // Percentage, bijv. 21
    weekId?: string;       // Afgeleide week-id 'YYYY-WW'
    source?: string;       // Bron/bestandsnaam
    appliedInvoiceId?: string | null; // Koppeling aan factuur
    appliedAt?: string | null;        // ISO timestamp
    createdAt?: string;    // ISO timestamp
}

export interface Supplier {
  id: string; // Firestore document ID
  companyName: string;
  kvkNumber?: string;
  vatNumber?: string;
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
  iban?: string;
  contactName?: string;
  contactEmail?: string;
  createdAt: string; // ISO string
}

export type VehicleStatusValue = string; // Now a generic string

export interface VehicleStatusOption {
    id: string;
    label: string;
    isDefault?: boolean;
}

export interface VehicleDocument {
    name: string;
    url: string;
}

export interface CostCalculationData {
    purchaseValue?: number;
    tireCount?: number;
    tireCost?: number;
    tireLifetime?: number;
    residualValue?: number;
    economicLifetime?: number;
    expectedYearlyKm?: number;
    fuelConsumption?: number;
    fuelPrice?: number;
    oilAndLubricants?: number;
    periodicMaintenance?: number;
    repairCost?: number;
    mrb?: number;
    eurovignette?: number;
    interestRate?: number;
    truckInsurance?: number;
    includeTruck?: boolean;
    salaryScale?: string;
    salaryStep?: number;
    driverAge?: number;
    overtime130?: number;
    overtime150?: number;
    surcharge19Hours?: number;
    structuralSurchargePercentage?: number;
    vacationDays?: number;
    sickDays?: number;
    waitingDays?: number;
    travelAllowanceKm?: number;
    otherCosts?: number;
    dailyUnaxedAllowance?: number;
    includePersonnel?: boolean;
    socialCharges?: number;
    pension?: number;
    trailerPurchaseValue?: number;
    trailerTireCount?: number;
    trailerTireCost?: number;
    trailerTireLifetime?: number;
    trailerResidualValue?: number;
    trailerEconomicLifetime?: number;
    trailerRepairCost?: number;
    trailerInsurance?: number;
    includeTrailer?: boolean;
    phoneCosts?: number;
    serviceVehicles?: number;
    managementSalary?: number;
    tlnCosts?: number;
    rent?: number;
    numVehicles?: number;
    generalInsurance?: number;
    manualKmRate?: number;
    manualHourRate?: number;
}


export interface Vehicle {
    id: string;
    licensePlate: string;
    make: string;
    model: string;
    status: VehicleStatusValue;
    createdAt: string;
    lastKnownMileage?: number;
    // New financial fields
    purchaseValue?: number;
    purchaseDate?: string; // ISO string
    monthlyLeaseAmount?: number;
    outstandingDepreciation?: number;
    documents?: VehicleDocument[];
    costCalculation?: CostCalculationData;
}

export type PurchaseInvoiceStatus = 'Nieuw' | 'Verwerkt' | 'Betaald';
export type PurchaseInvoiceStatusExtended = PurchaseInvoiceStatus | 'all' | 'overdue';

export const purchaseInvoiceCategories = ["gepland onderhoud", "ongepland onderhoud", "schade", "brandstof", "huur", "verzekering", "leasekosten", "overig"] as const;
export type PurchaseInvoiceCategory = typeof purchaseInvoiceCategories[number];

export const purchaseInvoiceCategoryTranslations: Record<PurchaseInvoiceCategory, string> = {
    "gepland onderhoud": "Gepland Onderhoud",
    "ongepland onderhoud": "Ongepland Onderhoud",
    "schade": "Schade",
    "brandstof": "Brandstof",
    "huur": "Huur",
    "verzekering": "Verzekering",
    "leasekosten": "Leasekosten",
    "overig": "Overig",
};

export interface PurchaseInvoice {
  id: string;
  kenmerk: string;
  supplierName: string;
  invoiceDate: string; // ISO date
  dueDate?: string; // ISO date
  grandTotal: number;
  status: PurchaseInvoiceStatus;
  createdAt: string; // ISO
  category?: PurchaseInvoiceCategory;
  aiResult?: { invoiceNumber?: string; kvkNumber?: string; lines?: InvoiceLine[] };
}
