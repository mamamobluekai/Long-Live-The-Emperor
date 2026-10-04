// One definition of "the canonical form of an email address" for this codebase.
//
// This exists because the pieces disagreed. Registration ran the email through
// express-validator's `normalizeEmail()`, which lowercases the whole address
// and - for gmail.com only - also strips dots and +tags from the local part.
// Login, forgot-password lookups and the Excel importers did no such thing, so
// an account could be stored one way and then be impossible to sign in to:
//
//   registered as "John.Doe@Gmail.com"  -> stored as "johndoe@gmail.com"
//   then signed in as "John.Doe@Gmail.com" -> looked up verbatim -> no match
//
// That is why gmail.com-style addresses appeared broken while plain
// all-lowercase addresses (the school domain) worked fine. Normalising on the
// way in AND on the way out makes both sides agree.
//
// This mirrors express-validator's `normalizeEmail()` so a value already
// rewritten by the validator stays stable when passed through here.
function normalizeEmail(value) {
  const email = String(value ?? '').trim();
  if (!email) return '';

  const at = email.lastIndexOf('@');
  if (at < 1) return email.toLowerCase();

  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();

  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    // Gmail treats dots as nothing and ignores anything after a "+".
    const plus = local.split('+')[0];
    return `${plus.replace(/\./g, '').toLowerCase()}@${domain}`;
  }

  return `${local.toLowerCase()}@${domain}`;
}

module.exports = { normalizeEmail };