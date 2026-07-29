// Profile-completion bonus — see pawvy-buttons-spec.md discussion: 50B,
// one-time, awarded once all required fields are filled on the customer's
// PRIMARY pet plus their contact preference (per the "primary pet drives
// everything" decision made after Patch 96's multi-pet question).
//
// "How they heard about Pawvy" is deliberately excluded from this list —
// it's captured automatically at signup, not something the pawrent fills
// in themselves, so it shouldn't gate the bonus.
//
// instagram_handle joined the required customer-level fields on KT's
// explicit call — it's optional at signup but mandatory to earn this bonus.

const { creditButtons } = require('./customers');

const PROFILE_BONUS_B = 50;

const REQUIRED_CUSTOMER_FIELDS = ['preferred_contact_channel', 'instagram_handle'];
const REQUIRED_PET_FIELDS = ['name', 'breed', 'weight', 'birthday', 'allergies', 'favorite_item', 'chew_power'];

function isProfileComplete(customer, primaryPet) {
  if (!customer) return false;
  const customerFieldsOk = REQUIRED_CUSTOMER_FIELDS.every(field => {
    const value = customer[field];
    return value !== null && value !== undefined && String(value).trim() !== '';
  });
  if (!customerFieldsOk) return false;
  if (!primaryPet) return false;
  return REQUIRED_PET_FIELDS.every(field => {
    const value = primaryPet[field];
    return value !== null && value !== undefined && String(value).trim() !== '';
  });
}

// Call this after ANY update to a customer's profile or primary pet info —
// checks completeness and awards the one-time 50B bonus if this update is
// what pushed it over the line. Safe to call repeatedly / on every save:
// the profile_bonus_claimed flag makes it a genuine no-op once claimed, so
// a pawrent editing a typo afterward never re-triggers or risks losing it
// (per the explicit requirement: editing must always stay possible without
// touching the bonus).
function checkAndAwardProfileBonus(db, customerId) {
  const customer = db.queryOne('SELECT * FROM customers WHERE id = ?', [customerId]);
  if (!customer) return { awarded: false, reason: 'customer_not_found' };
  if (customer.profile_bonus_claimed) return { awarded: false, reason: 'already_claimed' };

  const primaryPet = db.queryOne(
    'SELECT * FROM customer_pets WHERE customer_id = ? AND is_primary = 1 LIMIT 1',
    [customerId]
  );

  if (!isProfileComplete(customer, primaryPet)) {
    return { awarded: false, reason: 'incomplete' };
  }

  db.run('UPDATE customers SET profile_bonus_claimed = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [customerId]);
  creditButtons(db, { customer_id: customerId, amount: PROFILE_BONUS_B, source: 'profile_bonus', status: 'credited' });
  return { awarded: true, reason: 'newly_completed' };
}

module.exports = { isProfileComplete, checkAndAwardProfileBonus, PROFILE_BONUS_B, REQUIRED_CUSTOMER_FIELDS, REQUIRED_PET_FIELDS };
