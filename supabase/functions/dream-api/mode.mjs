export function emailDomain(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  return at === -1 ? '' : normalized.slice(at + 1);
}

export function isAutoClassified(_domain) {
  return true;
}

export function resolveDreamMode(_user, profile) {
  return {
    role: 'student',
    educationMode: true,
    ageBand: profile?.age_band ?? null,
    guardianRequired: false,
    onboardingCompleted: true,
    source: 'personal'
  };
}

