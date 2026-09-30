// Seeds a user with 30 days of history: onboarding rows, daily food (quick adds) and daily weights.
// Shared by smoke scripts and integration tests.

const iso = (d) => d.toISOString().slice(0, 10);
const osloDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(d);

export async function seedUser(admin, uid, { days = 30, kcal = 2600, startKg = 95, endKg = 94, runKm = 30, baseKcal = 2600 } = {}) {
  const today = osloDate(new Date());
  const dayStr = (offset) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return iso(d);
  };
  const start = dayStr(-days);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();

  const must = (r) => {
    if (r.error) throw r.error;
    return r;
  };
  must(await admin.from("profiles").upsert({
    user_id: uid, sex: "male", birth_date: "2004-03-15", height_cm: 193, timezone: "Europe/Oslo",
    checkin_weekday: weekday, onboarded_at: `${start}T08:00:00Z`,
  }));
  must(await admin.from("activity_baselines").insert({ user_id: uid, steps_per_day: 10000, run_km_per_week: runKm, other_training_hours_per_week: 0, valid_from: start }));
  must(await admin.from("goals").insert({ user_id: uid, target_weight_kg: 88, rate_kg_per_week: -0.5, valid_from: start }));
  must(await admin.from("energy_plans").insert({ user_id: uid, base_expenditure_kcal: baseKcal, source: "formula", protein_g_per_kg: 2, fat_pct: 0.25, valid_from: start }));

  const weights = [];
  for (let i = 0; i < days; i++) {
    const d = dayStr(-days + i);
    const kg = startKg + ((endKg - startKg) * i) / (days - 1) + (i % 3 === 0 ? 0.3 : -0.1); // some daily noise
    weights.push({ user_id: uid, measured_at: `${d}T06:30:00Z`, local_date: d, weight_kg: Math.round(kg * 10) / 10 });
  }
  must(await admin.from("weight_entries").insert(weights));

  for (let i = 0; i < days; i++) {
    const d = dayStr(-days + i);
    const { data: e } = must(await admin.from("food_entries").insert({ user_id: uid, logged_at: `${d}T17:00:00Z`, local_date: d, meal_type: "dinner", source: "quick" }).select("id").single());
    must(await admin.from("food_items").insert({ user_id: uid, food_entry_id: e.id, name: "Seeded day", kcal, protein_g: 150, carbs_g: 300, fat_g: 70 }));
  }
  return { today, start };
}
