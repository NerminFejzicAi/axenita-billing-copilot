# Ecosystem Compatibility Audit — 2026-08-10

**Projekt:** Auditabilni Axenita TARDOC Billing Safety Copilot
**Tip dokumenta:** arhitektonski audit zapis — **nije ADR**
**Status:** ACCEPTED (eksterni arhitektonski review: PASS)
**Datum audita:** 2026-08-10
**Auditirani canonical HEAD:** `6f74caccf4df633d89e25d3d5f94a3649bca04f4`

---

# 0. Kontekst i granice audita

Ovaj dokument je **zapis izvršenog audita**. Ne uvodi nijednu novu odluku, rolu, permisiju,
endpoint, schema kolonu, migration paket ni arhitektonsko pravilo. Ne zamjenjuje
`06_DECISION_LOG.md` i ne mijenja njegov autoritet.

Utvrđeno i potvrđeno:

- **Faza 1 je formalno zatvorena prije audita.** Kanonski lanac:
  - frozen architecture baseline: `35aff83649521f402bbf5e39daabca4858ccc8af`
  - Phase 1 implementation: `4ca591a962ef87f0b5f1f46650e786dba43e3db7`
  - Phase 1 implementation merge: `1fa4b19e3c9dc3a91df2cd70537564e147b68d67`
  - Phase 1 documentary closure: `b8853933ebac73661fbe96cbbd9418da9bc599cf`
  - Phase 1 closure merge: `6f74caccf4df633d89e25d3d5f94a3649bca04f4`
- **Audit je bio read-only.** Tokom audita nijedan fajl nije kreiran, izmijenjen ni obrisan;
  ništa nije stageovano, commitovano, pushovano ni granano.
- **Zamrznute odluke D-001 do D-046 nisu promijenjene.** `docs/06_DECISION_LOG.md` ostaje
  bajt-identičan kroz cijeli lanac faze 1 (blob `fcdc76f89845e0567f507dcb7bd98991523a9bb9`).
- **D-OPEN-011 ostaje OTVOREN** i nije riješen, sužen ni reinterpretiran ovim auditom.
- **Nijedan Faza 2 rad nije izvršen** tokom audita.
- **Nijedan novi ADR nije kreiran.**

Autoritet dokumentacije ostaje onakav kakav definišu `README.md` §2 i `AGENTS.md` §2. Ako
bilo koji zaključak ovog audita ikada dođe u sukob sa zamrznutom odlukom, mjerodavna je
zamrznuta odluka, a sukob se rješava kontrolisanim ADR postupkom — ne tihom
reinterpretacijom.

---

# 1. Svrha

Audit odgovara na tačno jedno pitanje:

> **Does the frozen Arztpraxis architecture unnecessarily prevent the TARDOC Billing Safety
> Copilot from becoming the first major module of a future Swiss Medical AI Platform?**

Audit **ne** odgovara na pitanje "kako bismo dizajnirali Swiss Medical AI Platform od nule".

Vodeći princip:

> **`ecosystem-ready, not ecosystem-built`**

Praktična posljedica principa: prednost ima očuvanje zamrznute arhitekture koja radi, osim
kada postoji dokaz o konkretnoj blokadi. Arhitektonska elegancija, buduća fleksibilnost i
"moglo bi jednom zatrebati" **nisu** dovoljan razlog za promjenu.

---

# 2. Executive conclusion

- Zamrznuta arhitektura je **dovoljno ecosystem-kompatibilna**.
- **Nijedna arhitektonska korekcija prije Faze 2 nije potrebna.**
- **`FIX_NOW REGISTER: EMPTY`**
- **Faza 2 smije početi nepromijenjena**, pod trenutno zamrznutom arhitekturom.

Najjači postojeći platformski temelji: razdvajanje tenant/platform identiteta, kompozicija
permisija, append-only audit trail, rukovanje eksternim identifikatorima, AI kao prijedlog
umjesto autoriteta, i granica tarifnog servisa.

Dvije oblasti nose stvarni reusability dug, ali nijedna nije blokada za Fazu 2:

- **Encounter lifecycle** — entitet je nezavisan od tarife, ali `encounter_status`
  (`02` §4.3) nosi semantiku billing pipelinea.
- **Evidence** — ne postoji ponovo upotrebljiva evidence sposobnost; `candidate_evidence`
  (`02` §10.7) i `finding_evidence` (`02` §12.4) su strukturno u vlasništvu billing roditelja.

Razlog zašto nijedna nije `FIX_NOW`: Faza 2 (`04` §4.3, `02` §22.1) kreira samo Prisma
wiring, database role i base migraciju. Nijedna od tih schema nije fiksirana Fazom 2 —
najranija tačka odluke je paket `003` (Faza 5).

---

# 3. Klasifikacijska pravila

Svaka oblast dobija tačno jednu primarnu klasifikaciju.

## KEEP

Trenutna arhitektura je dovoljno kompatibilna. Nema akcije prije Faze 2. Odluka se **ne
otvara ponovo**.

## WRAP

Model/implementacija smije ostati suštinski kakva jeste, ali eksplicitna granica, adapter,
interfejs ili ugovor o vlasništvu treba zaštititi ostatak sistema od spajanja.

`WRAP` **ne** ovlašćuje implementaciju odmah. Svaki `WRAP` nalaz nosi vrijeme uvođenja:

- `WRAP NOW`
- `WRAP AT IMPLEMENTATION`
- `WRAP WHEN SECOND CONSUMER EXISTS`

## DECOUPLE_LATER

Spajanje postoji, ali ne blokira Fazu 2, ne postoji drugi stvarni potrošač koji zahtijeva
razdvajanje, a rješavanje sada bilo bi spekulativno. Obavezno se bilježi **trigger**.

## FIX_NOW

Visok prag dokaza. Nalaz mora dokazati **sva četiri** uslova:

1. koji konkretno planirani budući modul je pogođen;
2. koji tačno zamrznuti arhitektonski element stvara blokadu;
3. zašto bi ulazak u **Fazu 2** materijalno povećao kasniji trošak/rizik migracije;
4. koja je najmanja moguća korekcija koja uklanja blokadu.

Ako se sva četiri ne mogu demonstrirati, nalaz **ne smije** biti `FIX_NOW`.

---

# 4. Master klasifikacija

| # | Oblast | Coupling rizik | Klasifikacija | Akcija prije Faze 2 |
|---|---|---|---|---|
| 1 | Encounter Core | domain HIGH, persistence LOW | **WRAP AT IMPLEMENTATION** (W1) | nema |
| 2 | Evidence | domain HIGH, persistence HIGH | **DECOUPLE_LATER** (D1) | nema |
| 3 | Tariff Engine | LOW | **KEEP**; aktivacija release-a → DECOUPLE_LATER (D2) | nema |
| 4 | PVS / Axenita integracija | domain MEDIUM, vendor MEDIUM | **WRAP WHEN SECOND CONSUMER EXISTS** (W3) | nema |
| 5 | AI provider abstraction | LOW | **KEEP** | nema |
| 6 | Audit Trail | LOW | **KEEP**; platform-scope → DECOUPLE_LATER (D4) | nema |
| 7 | Identity / Tenant | LOW | **KEEP** | nema |
| 8 | Roles / Permissions | LOW | **KEEP** | nema |
| 9 | External / Internal IDs | domain MEDIUM, vendor MEDIUM | **DECOUPLE_LATER** (D3) | nema |
| 10 | API boundaries | LOW | **KEEP** | nema |
| 11 | Module boundaries | LOW | **KEEP** | nema |
| 12 | Data ownership | domain MEDIUM, persistence MEDIUM | **WRAP AT IMPLEMENTATION** (W2) | nema |
| 13 | Documentation Copilot kompatibilnost | domain HIGH | **DECOUPLE_LATER** (vezano za D1 i W1) | nema |
| 14 | Reception / Voice kompatibilnost | LOW | **KEEP** | nema |

Nijedan budući modul izvan gore navedenih testova kompatibilnosti nije izmišljen ni
katalogiziran.

---

# 5. KEEP register

Prihvaćeni platformski temelji. **Ne otvaraju se ponovo.**

| # | Temelj | Izvor |
|---|---|---|
| K1 | Modularni monolit sa jednim glavnim backendom | D-001; `00` §3 |
| K2 | PostgreSQL kao poslovni source of truth | D-002; `00` §4.2 |
| K3 | Database-level tenant izolacija: RLS + composite FK + transakcijski lokalni kontekst | D-006, D-033; `02` §16–§17 |
| K4 | URI API versioning `/api/v1` | D-007; `03` §2 |
| K5 | Problem Details sa stabilnim katalogom kodova | D-008; `03` §8 |
| K6 | Idempotency i optimistic locking | D-009; `03` §4–§5 |
| K7 | Transactional outbox | D-011; `00` §11 |
| K8 | AI kao prijedlog, nikada autoritativna istina | D-012; `00` §2.2, §9 |
| K9 | Mock-first eksterne integracije | D-013; `13` §17 |
| K10 | Ne implementirati TARDOC — eksterni tarifni engine | D-014; `00` §10 |
| K11 | Immutable analysis revizije i immutable approval snapshot | D-015, D-016; `00` §7.3, §7.5 |
| K12 | Eksterni ID kroz HMAC + AES-256-GCM envelope | D-018, D-025; `02` §2.7; `09` §8 |
| K13 | Bezuslovni `unique (practice_id, id)` na tenant tabelama | D-022; `02` §2.5 |
| K14 | Razdvajanje tenant i platform rola; `SYSTEM_ADMIN` bez automatskog tenant pristupa | D-023, D-038; `15` §2.3 |
| K15 | Izvedene eksplicitne permisije; bez hijerarhije i bez per-user overrida | D-038–D-045; `15` §3.2 |
| K16 | Tarifni engine kao odvojen servis sa internim ugovorom | `01` §5.2, §13.3; `03` §30 |
| K17 | Append-only audit trail sa hash lancem | `02` §15.4, §19.2; `09` §12 |
| K18 | Reproduktivnost: ESM/NodeNext, zaključan toolchain, digest-pinovani imageovi | D-021; `00` §5.3; `compose.yaml` |

---

# 6. WRAP register

## W1 — Encounter lifecycle

**Trenutno stanje.** `encounters` (`02` §7.2) nema nijednu kolonu ni FK prema tarifi,
analizi, findingu, approvalu ni exportu; zavisnost ide ispravno (`analysis_runs` →
`encounters`). Međutim `encounter_status` (`02` §4.3) sadrži vrijednosti billing pipelinea
(`ANALYSIS_IN_PROGRESS`, `REVIEW_REQUIRED`, `APPROVED`, `EXPORT_PENDING`, `EXPORTED`) uz
kliničke vrijednosti (`DRAFT`, `CANCELLED`, `CLOSED`). Normativni state machine je
`03` §29.1, zamrznut kroz D-027.

**Klasifikacija:** `WRAP AT IMPLEMENTATION`

**Tačka odluke:** prije nego što Encounter schema/lifecycle postane implementacijski rad
(migration paket `003_patient_encounter_documents`, `02` §22.3).

> **The audit does not decide whether the eventual solution is a second lifecycle attribute,
> projection, or another minimal design. That decision belongs to the implementation-phase
> architecture gate.**

Svaka izmjena `03` §29.1 zahtijeva superseding ADR jer je D-027 ACCEPTED.

## W2 — `finding_evidence` integritet i vlasništvo

**Trenutno stanje.** `finding_evidence` (`02` §12.4) deklariše samo `unique (practice_id, id)`;
composite FK prema `rule_findings` **nije deklarisan** i već je zaveden kao otvorena stavka
sa rokom prije paketa `008_safety_findings` (`02` §28.1).

**Klasifikacija:** `WRAP AT IMPLEMENTATION`

**Priroda stavke:** ovo se bilježi prvenstveno kao **postojeća schema-integrity/governance
stavka**, sa već definisanim rokom u `02` §28.1. **Ne** pretvara se u generički evidence
arhitektonski rad; opšte pitanje ponovne upotrebljivosti evidencije vodi se odvojeno kao D1.

Napomena za potpunost: `02` §28.1 eksplicitno navodi da sedmoredna tabela **nije** potpun
globalni inventar i da šest `analysis_run_id` relacija čini zasebnu otvorenu stavku bez
definisanog roka. Audit to samo bilježi; ne mijenja i ne proširuje.

## W3 — Eksterni patient / PVS identitet

**Trenutno stanje.** `patient_references` (`02` §7.1) deklariše
`unique (practice_id, source_system, external_patient_ref_hash)`, čime se pacijentska
referenca vezuje za **jedan** izvorni sistem. Generički mapping mehanizam
`external_resource_links` (`02` §14.2) već postoji i mogao bi nositi N:M vezu.

**Klasifikacija:** `WRAP WHEN SECOND CONSUMER EXISTS`

**Trigger:** drugi PVS, ili drugi odobreni workflow koji zahtijeva usklađivanje više
eksternih identiteta nad istim internim zapisom.

**Akcija sada:** nema. `13` §7 vodi Axenitu kao `BLOCKED EXTERNAL`.

## W4 — Dijeljeni contract / error katalog

**Trenutno stanje.** Zamrznuti katalog error kodova živi u
`apps/api/src/common/errors/error-codes.ts`, dok bi drugi potrošač ili generisani klijent
importovao `packages/contracts`.

**Klasifikacija:** `WRAP WHEN SECOND CONSUMER EXISTS`

**Akcija sada:** nema.

---

# 7. DECOUPLE_LATER register

| # | Spajanje | Prihvaćeni trigger |
|---|---|---|
| **D1** | Evidence nije ponovo upotrebljiva sposobnost — `candidate_evidence` zahtijeva `service_candidate`, `finding_evidence` zahtijeva `rule_finding` (`02` §10.7, §12.4) | Documentation Copilot postaje odobrena implementaciona faza, ili se pojavi drugi stvarni potrošač evidencije |
| **D2** | Tačno jedan globalno aktivan tariff release — `tariff_releases_one_active_idx` (`02` §9.1) | Drugi tarifni engine ili paralelna version family zahtijeva istovremeno izvršavanje, ili se traži evaluacija po treatment periodu |
| **D3** | Identitet pacijenta vezan za jedan izvorni sistem (`02` §7.1) | Drugi PVS adapter je stvarno naručen |
| **D4** | Nema platform-scope audita — `audit_events.practice_id NOT NULL` (`02` §15.4, D-023) | Odobren platform-level modul sa stvarnim cross-tenant administrativnim radnjama |
| **D5** | Integration vokabular na core entitetima — `encounters.source_system`, `patient_references.source_system` (`02` §4.6, §7.1, §7.2) | Drugi PVS, ili intake tok koji ne potiče iz PVS-a |

Datumi se namjerno ne dodjeljuju: `13` vodi Axenitu, OAAT, AI providera i hosting kao
otvorene ili eksterno blokirane, pa stvarni roadmap datum ne postoji.

---

# 8. FIX_NOW register

`FIX_NOW REGISTER: EMPTY`

Nijedno od razmatranih spajanja ne zadovoljava zahtijevani četvorodijelni prag za korekciju
prije Faze 2. Konkretno pada **uslov 3**: Faza 2 (`04` §4.3, `02` §22.1) kreira ekstenzije,
database role i base migraciju, i **ne fiksira nijednu** od spornih schema. Najranija tačka
u kojoj bilo koje spajanje postaje obavezujuće je migration paket `003` (Faza 5), a za više
stavki tek `004`, `007`, `008`, `010` ili `011`.

Nijedna `FIX_NOW` stavka nije izmišljena da bi se proizveo posao.

---

# 9. Kompatibilnost sa budućim potrošačima

Isključivo testovi kompatibilnosti. **Nisu odobren implementacioni scope.**

## Documentation Copilot

Ponovo upotrebljivo bez izmjene: Tenant/Identity, Permissions (dodavanjem vlastitog
`domain.action` namespacea), Audit Trail, AI abstraction, Documents.

Zahtijeva rad: Encounter lifecycle (W1) i Evidence (D1).

## Reception / Voice Assistant

Ponovo upotrebljivo bez izmjene: tenant/practice, identity, patient reference, audit,
integration granice, AI provider granice. Ne zahtijeva nijedan billing koncept.

Jedina zajednička stavka: eksterni identitet pacijenta (D3/W3).

Nijedan appointment/reservation rad nije oživljen niti podrazumijevan.

---

# 10. Decision gates koje treba očuvati

## Prije Faze 3

**`D-OPEN-011 must be resolved according to its existing frozen deadline.`**

Ovo **nije** nalaz Ecosystem Audita i **nije** riješeno ovim auditom. Obaveza postoji
nezavisno, prema `06_DECISION_LOG.md` (D-OPEN-011, `MUST DECIDE BEFORE PHASE 3`),
`02` §28.2 i `13` §16.

## Prije Encounter implementacije

Ponovo razmotriti:

- **W1** Encounter lifecycle;
- **W3 / D3** patient / external identitet.

Svrha je izbor **minimalnog implementaciono-sigurnog dizajna u tom trenutku**, a ne
generalizacija platforme.

## Kada Documentation Copilot postane odobrena implementaciona faza

Ponovo razmotriti:

- **D1** ponovo upotrebljiva Evidence sposobnost.

## Kada drugi PVS bude stvarno naručen

Ponovo razmotriti:

- **D3 / W3** model eksternog identiteta.

## Kada paralelni tariff releasevi / version families postanu obavezni

Ponovo razmotriti:

- **D2** model aktivacije tarifnog releasea.

---

# 11. Phase 2 authorization conclusion

> **Phase 2 may proceed under the currently frozen architecture without ecosystem-driven
> pre-refactoring.**

> **This audit does not authorize implementation of any future module or abstraction.**

Faza 2 ostaje tačno onakva kakvu definiše `04` §4: Prisma 7, `schema.prisma`,
`prisma.config.ts`, generisani client, `MIGRATION_DATABASE_URL` / `DATABASE_URL`,
`copilot_migrator` i `copilot_app`, `DatabaseModule`, `PrismaService`, migration scripts i DB
health. Ovaj audit ne dodaje, ne uklanja i ne mijenja nijednu stavku tog scopea.

---

# 12. Otvorena pitanja koja zamrznuta dokumentacija ne rješava

Audit ih **bilježi**, ne popunjava.

1. **D-OPEN-011** — runtime access model za `users` i `practices`. Ostaje otvoren.
2. **Šest `analysis_run_id` composite FK relacija** — zasebna otvorena governance stavka bez
   definisanog roka i referencijalnih akcija (`02` §28.1).
3. **Semantika `source_system` provenijencije** — nije definisano da li se mijenja kada se
   ručno kreiran zapis kasnije poveže sa PVS-om.
4. **Namjera Evidence koncepta** — nijedan dokument ne izjašnjava se da li je evidencija
   zamišljena kao ponovo upotrebljiva sposobnost ili namjerno ograničena na billing.
5. **Granularnost aktivacije tarifnog releasea** — `02` §9.1 predviđa moguću potrebu, bez
   odluke.
6. **Platform-scope auditabilnost** — D-023 zaključuje da nije potrebna za MVP; nema
   zabilježenog stava za multi-modul platformu.
7. **Da li je Swiss Medical AI Platform odobren produktni pravac** — nijedan dokument u
   repozitoriju to ne tvrdi. Audit je zato uslovan: odgovara na "da li zamrznuta arhitektura
   ovo blokira", ne na "da li je ovo planirano".

---

# 13. Prihvaćeni rizici za kasnije

| Rizik | Prihvaćen jer | Preostala izloženost |
|---|---|---|
| Evidence nije ponovo upotrebljiva (D1) | Nema drugog potrošača; generička tabela sada bila bi spekulativna (`00` §5.3) | Documentation Copilot faza tražiće schema rad u evidence oblasti |
| Encounter lifecycle billing-coupled (W1) | D-027 je ACCEPTED; tačka korekcije je Faza 5 | Kasnija izmjena `03` §29.1 traži superseding ADR |
| Jedan aktivan tariff release (D2) | Dokumentovano kao poznata buduća potreba | Paralelne version families traže izmjenu indeksa |
| Patient identitet vezan za jedan izvorni sistem (D3) | Drugi PVS nije naručiv | Duplirani interni identiteti ako se pojave dva PVS-a prije korekcije |
| Nema platform-scope audita (D4) | Namjerna odluka D-023 sa analizom | Platform-level modul traži novi ADR |
| Nedeklarisani composite FK-ovi (W2) | Već datirano u `02` §28.1 | Rupe u referencijalnom integritetu ako rokovi kasne |

---

# 14. Status zapisa

- Ovaj dokument je **audit zapis**, ne ADR.
- Ne mijenja `06_DECISION_LOG.md`.
- Ne mijenja nijednu zamrznutu odluku D-001 do D-046.
- Ne rješava D-OPEN-011.
- Ne odobrava implementaciju nijednog budućeg modula ni apstrakcije.
- Ne pokreće Fazu 2; samo bilježi da Faza 2 **smije** početi pod zamrznutom arhitekturom.
