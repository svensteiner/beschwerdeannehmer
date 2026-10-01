export type Channel = "telefon" | "whatsapp" | "web";

export type CallStatus = "erledigt" | "weitergeleitet" | "offen" | "notfall";

export type Urgency = "routine" | "bald" | "notfall";

export type Bundesland =
  | "Wien"
  | "Niederösterreich"
  | "Oberösterreich"
  | "Steiermark"
  | "Tirol"
  | "Salzburg"
  | "Kärnten"
  | "Vorarlberg"
  | "Burgenland";

export type Practice = {
  name: string;
  shortName: string;
  owner: string;
  street: string;
  zip: string;
  city: string;
  bundesland: Bundesland;
  phone: string;
  whatsapp: string;
  email: string;
  hours: { day: string; time: string }[];
  nachtdienst: { name: string; phone: string; note: string };
};
export type CallRecord = {
  id: string;
  at: string;
  channel: Channel;
  caller: string;
  pet: string;
  species: string;
  concern: string;
  status: CallStatus;
  durationSec: number;
  transcript: { from: "anrufer" | "alma"; text: string }[];
  action: string;
};
export type Appointment = {
  id: string;
  start: string;
  minutes: number;
  owner: string;
  pet: string;
  type: string;
  vet: string;
  channel: Channel;
};
export type ChatThread = {
  id: string;
  name: string;
  pet: string;
  preview: string;
  unread: number;
  intern?: boolean;
  messages: { from: "owner" | "alma"; text: string; at: string }[];
};

export type VetMail = {
  id: string;
  at: string;
  to: string;
  subject: string;
  body: string;
  pet: string;
};

export type EmergencyCase = {
  id: string;
  at: string;
  owner: string;
  pet: string;
  species: string;
  summary: string;
  urgency: Urgency;
  routedTo: string;
  status: "neu" | "verbunden" | "dokumentiert";
};

export type Lead = {
  id: string;
  practice: string;
  contact: string;
  email: string;
  phone: string;
  bundesland: Bundesland | "";
  pms: string;
  message: string;
  createdAt: string;
};
