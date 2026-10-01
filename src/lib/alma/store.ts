import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AvatarId } from "./avatars";
import type { Patient } from "./patients";
import type { Appointment, CallRecord, ChatThread, EmergencyCase, VetMail } from "./types";
import { DEFAULT_VOICE, type VoiceId } from "./voices";
import {
  announceTrainedFactsChange,
  initializeTrainedFacts,
  mutateTrainedFacts,
  onTrainedFactsChange,
} from "./trained-facts-repository";

export const MAX_TRAINED_FACTS = 40;

type AlmaState = {
  extraAppointments: Appointment[];
  extraCalls: CallRecord[];
  extraEmergencies: EmergencyCase[];
  emergenciesHandled: string[];
  avatarId: AvatarId;
  voiceId: VoiceId;
  edition: "standard" | "akte";
  kbPatients: Patient[];
  trainedFacts: string[];
  trainedFactsReady: boolean;
  extraThreads: ChatThread[];
  extraMails: VetMail[];
  notifyWhatsapp: boolean;
  notifyEmail: boolean;
  addAppointment: (appointment: Appointment) => void;
  addCall: (call: CallRecord) => void;
  addEmergency: (item: EmergencyCase) => void;
  addThread: (thread: ChatThread) => void;
  addMail: (mail: VetMail) => void;
  markEmergency: (id: string) => void;
  setAvatar: (id: AvatarId) => void;
  setVoice: (id: VoiceId) => void;
  setEdition: (edition: "standard" | "akte") => void;
  setNotifyWhatsapp: (on: boolean) => void;
  setNotifyEmail: (on: boolean) => void;
  addKbPatient: (p: Patient) => void;
  hydrateTrainedFacts: () => Promise<boolean>;
  addTrainedFact: (fact: string) => Promise<boolean>;
  replaceTrainedFact: (previous: string, next: string) => Promise<boolean>;
  removeTrainedFact: (fact: string) => Promise<boolean>;
};

export const useAlmaStore = create<AlmaState>()(
  persist(
    (set, get) => ({
      extraAppointments: [],
      extraCalls: [],
      extraEmergencies: [],
      emergenciesHandled: [],
      avatarId: "wien",
      voiceId: DEFAULT_VOICE,
      edition: "akte",
      kbPatients: [],
      trainedFacts: [],
      trainedFactsReady: false,
      extraThreads: [],
      extraMails: [],
      notifyWhatsapp: true,
      notifyEmail: true,
      addAppointment: (appointment) =>
        set((s) => ({ extraAppointments: [appointment, ...s.extraAppointments].slice(0, 30) })),
      addCall: (call) => set((s) => ({ extraCalls: [call, ...s.extraCalls].slice(0, 30) })),
      addEmergency: (item) =>
        set((s) => ({ extraEmergencies: [item, ...s.extraEmergencies].slice(0, 20) })),
      addThread: (thread) =>
        set((s) => ({ extraThreads: [thread, ...s.extraThreads.filter((t) => t.id !== thread.id)].slice(0, 20) })),
      addMail: (mail) => set((s) => ({ extraMails: [mail, ...s.extraMails].slice(0, 20) })),
      markEmergency: (id) =>
        set((s) => ({
          emergenciesHandled: s.emergenciesHandled.includes(id)
            ? s.emergenciesHandled
            : [...s.emergenciesHandled, id],
        })),
      setAvatar: (id) => set({ avatarId: id }),
      setVoice: (id) => set({ voiceId: id }),
      setEdition: (edition) => set({ edition }),
      setNotifyWhatsapp: (on) => set({ notifyWhatsapp: on }),
      setNotifyEmail: (on) => set({ notifyEmail: on }),
      addKbPatient: (p) =>
        set((s) => ({
          kbPatients: [
            p,
            ...s.kbPatients.filter(
              (x) =>
                x.chip !== p.chip && x.name.toLowerCase() !== p.name.toLowerCase(),
            ),
          ].slice(0, 16),
        })),
      hydrateTrainedFacts: async () => {
        const initialized = await initializeTrainedFacts(get().trainedFacts);
        if (!initialized.ok) return false;
        try { set({ trainedFacts: initialized.facts, trainedFactsReady: true }); } catch { /* IDB bleibt maßgeblich. */ }
        return true;
      },
      addTrainedFact: async (fact) => {
        const clean = fact.replace(/\s+/g, " ").trim().slice(0, 240);
        if (clean.length < 8) return false;
        if (!await get().hydrateTrainedFacts()) return false;
        const changed = await mutateTrainedFacts((facts) => {
          if (facts.some((item) => item.toLowerCase() === clean.toLowerCase())) return facts;
          if (facts.length >= MAX_TRAINED_FACTS) return null;
          return [clean, ...facts];
        });
        if (!changed.ok) return false;
        try { set({ trainedFacts: changed.facts, trainedFactsReady: true }); } catch { /* IDB-Commit bleibt erfolgreich. */ }
        announceTrainedFactsChange();
        return true;
      },
      replaceTrainedFact: async (previous, next) => {
        const before = previous.replace(/\s+/g, " ").trim();
        const clean = next.replace(/\s+/g, " ").trim().slice(0, 240);
        if (clean.length < 8) return false;
        if (!await get().hydrateTrainedFacts()) return false;
        const changed = await mutateTrainedFacts((facts) => {
          const index = facts.findIndex((item) => item.toLowerCase() === before.toLowerCase());
          if (index < 0) return null;
          return facts.some((item, i) => i !== index && item.toLowerCase() === clean.toLowerCase())
            ? facts.filter((_, i) => i !== index)
            : facts.map((item, i) => i === index ? clean : item);
        });
        if (!changed.ok) return false;
        try { set({ trainedFacts: changed.facts, trainedFactsReady: true }); } catch { /* IDB-Commit bleibt erfolgreich. */ }
        announceTrainedFactsChange();
        return true;
      },
      removeTrainedFact: async (fact) => {
        const before = fact.replace(/\s+/g, " ").trim();
        if (!await get().hydrateTrainedFacts()) return false;
        const changed = await mutateTrainedFacts((facts) => {
          if (!facts.some((item) => item.toLowerCase() === before.toLowerCase())) return null;
          return facts.filter((item) => item.toLowerCase() !== before.toLowerCase());
        });
        if (!changed.ok) return false;
        try { set({ trainedFacts: changed.facts, trainedFactsReady: true }); } catch { /* IDB-Commit bleibt erfolgreich. */ }
        announceTrainedFactsChange();
        return true;
      },
    }),
    {
      name: "alma-ordination",
      version: 2,
      migrate: (persisted) => {
        if (!persisted || typeof persisted !== "object") return persisted as AlmaState;
        const { leads: _leads, ...withoutLeads } = persisted as Record<string, unknown>;
        return withoutLeads as AlmaState;
      },
      partialize: (s) => ({
        avatarId: s.avatarId,
        voiceId: s.voiceId,
        extraAppointments: s.extraAppointments,
        extraCalls: s.extraCalls,
        extraEmergencies: s.extraEmergencies,
        edition: s.edition,
        kbPatients: s.kbPatients,
        ...(s.trainedFactsReady ? {} : { trainedFacts: s.trainedFacts }),
        extraThreads: s.extraThreads,
        extraMails: s.extraMails,
        notifyWhatsapp: s.notifyWhatsapp,
        notifyEmail: s.notifyEmail,
      }),
    },
  ),
);

if (typeof window !== "undefined") {
  onTrainedFactsChange(() => { void useAlmaStore.getState().hydrateTrainedFacts(); });
}
