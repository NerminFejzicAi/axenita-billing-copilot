/**
 * The public `201` document of `POST /api/v1/encounters` (`03` §12; D-085 `OD-D085-17`).
 *
 * CLOSED. Exactly seven top-level members and, inside `patient`, exactly two. `RULING Q` forbids
 * every other member — in particular `responsiblePhysicianId`, `guarantorType`,
 * `insuranceContext`, `specialtyCode`, `patientAgeAtEncounter`, `patientSexAtEncounter`,
 * `sourceSystem`, `diagnoses`, audit metadata, idempotency metadata and internal database
 * columns. An idempotent replay uses this SAME shape and adds nothing.
 *
 * `occurredAt` and `createdAt` are UTC ISO-8601 with millisecond precision and a terminal `Z`;
 * `treatmentDate` is `YYYY-MM-DD` (`OD-D085-5`).
 */
export interface EncounterCreatedPatientDto {
  readonly id: string;
  readonly pseudonym: string;
}

export interface EncounterCreatedResponseDto {
  readonly id: string;
  readonly status: string;
  readonly version: number;
  readonly patient: EncounterCreatedPatientDto;
  readonly occurredAt: string;
  readonly treatmentDate: string;
  readonly createdAt: string;
}
