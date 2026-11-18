-- The sea's species changed (docs/decisions/0013-community-sea-models.md): the game now draws ten
-- animals from community models. Four species are new; the others keep their id, weight range and
-- price. The old rows stay (the ledger of fish already caught still points at them, and an unused
-- row costs nothing), so nothing is deleted or changed here, only added.
-- Written once here and once in src/ocean/economy.ts; tests/economy.test.mjs keeps them equal.
insert into economy_private.fish_prices(species, base, min_kg, max_kg) values
('ca-madeka', 6, 0.01, 0.06),
('sua', 10, 0.3, 4),
('rua-bien', 99, 20, 120),
('ca-heo', 351, 60, 200)
on conflict (species) do nothing;
