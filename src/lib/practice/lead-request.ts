export type LeadFormSnapshot = {
  practice: string;
  contact: string;
  email: string;
  phone: string;
  bundesland: string;
  pms: string;
  message: string;
};

export function leadRequestSignature(form: LeadFormSnapshot) {
  return JSON.stringify(form);
}

export function leadRequestForSnapshot(
  previous: { signature: string; requestId: string } | null,
  form: LeadFormSnapshot,
  randomId: () => string,
) {
  const signature = leadRequestSignature(form);
  return previous?.signature === signature
    ? previous
    : { signature, requestId: randomId() };
}
