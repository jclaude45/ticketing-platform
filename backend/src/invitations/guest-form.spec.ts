import { cleanAnswers, cleanFields, countTaken, fieldsFor, guestToken, ticketIdFromToken, type FormField } from './guest-form';

// The link is signed with the server secret: the image build runs these tests without one
process.env.ACCREDITATION_HMAC_SECRET ??= 'test-secret';

const TPL = 'tpl-vip';
const fields: FormField[] = cleanFields([
  { id: 'tshirt', type: 'CHOICE', label: 'Taille de t-shirt', required: true, options: [{ id: 'opt_m', label: 'M', limit: 1 }, { id: 'opt_l', label: 'L' }], templateIds: [TPL] },
  { id: 'vege', type: 'YESNO', label: 'Repas végétarien', required: false },
  { id: 'note', type: 'TEXT', label: 'Remarque', required: false },
], [TPL, 'tpl-std']);

describe('guest form', () => {
  it('keeps the questions of each category', () => {
    expect(fieldsFor(fields, TPL).map((f) => f.id)).toEqual(['tshirt', 'vege', 'note']);
    expect(fieldsFor(fields, 'tpl-std').map((f) => f.id)).toEqual(['vege', 'note']);
  });

  it('refuses a malformed question', () => {
    expect(() => cleanFields([{ id: 'xx11', type: 'CHOICE', label: 'Table', required: false, options: [] }], [])).toThrow(/au moins un choix/);
    expect(() => cleanFields([{ id: 'xx11', type: 'TEXT', label: 'A', required: false, templateIds: ['autre'] }], [TPL])).toThrow(/catégorie/);
    expect(() => cleanFields([{ id: 'xx11', type: 'TEXT', label: 'A' }, { id: 'xx11', type: 'TEXT', label: 'B' }], [])).toThrow(/identifiant/);
  });

  it('checks the answers and drops unknown keys', () => {
    const a = cleanAnswers({ tshirt: 'opt_l', vege: true, note: '  Allergie  ', other: 'x' }, fields, {});
    expect(a).toEqual({ tshirt: 'opt_l', vege: true, note: 'Allergie' });
    expect(() => cleanAnswers({ vege: false }, fields, {})).toThrow(/réponse requise/);
    expect(() => cleanAnswers({ tshirt: 'xxl' }, fields, {})).toThrow(/choix invalide/);
    expect(() => cleanAnswers({ tshirt: 'opt_l', vege: 'oui' }, fields, {})).toThrow(/oui ou non/);
  });

  it('refuses an option whose places are taken by other guests, not by oneself', () => {
    const confirmed = [{ ticketId: 'a', answers: { tshirt: 'opt_m' } }];
    expect(() => cleanAnswers({ tshirt: 'opt_m' }, fields, countTaken(fields, confirmed, 'b'))).toThrow(/complet/);
    expect(cleanAnswers({ tshirt: 'opt_m' }, fields, countTaken(fields, confirmed, 'a'))).toEqual({ tshirt: 'opt_m' });
  });

  it('accepts only its own signed link', () => {
    const id = '0b8f1c9e-3a51-4f4e-9d36-2f7a1c3b5e10';
    const token = guestToken(id);
    expect(ticketIdFromToken(token)).toBe(id);
    expect(ticketIdFromToken(`${id}.${'A'.repeat(22)}`)).toBeNull();
    expect(ticketIdFromToken(token.replace(/^0/, '1'))).toBeNull();
    expect(ticketIdFromToken('nimporte-quoi')).toBeNull();
  });
});
