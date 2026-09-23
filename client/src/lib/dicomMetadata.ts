import { wadouri } from "./cornerstone";

/**
 * The only DICOM attributes this application is allowed to read.
 *
 * Patient-identifying attributes (PatientName 0010,0010, PatientID 0010,0020,
 * PatientBirthDate 0010,0030, AccessionNumber 0008,0050, ...) are deliberately
 * never read, never rendered and never logged — only these non-identifying
 * attributes are extracted. See README → "Security & privacy".
 */
export const ALLOWED_TAGS = {
  studyDate: "x00080020",
  modality: "x00080060",
  numberOfFrames: "x00280008",
  rows: "x00280010",
  columns: "x00280011",
} as const;

export interface StudyMetadata {
  modality: string | null;
  /** Normalised to `yyyy-mm-dd`; DICOM DA values are `yyyymmdd`. */
  studyDate: string | null;
  rows: number | null;
  columns: number | null;
  numberOfFrames: number | null;
}

export const EMPTY_STUDY_METADATA: StudyMetadata = {
  modality: null,
  studyDate: null,
  rows: null,
  columns: null,
  numberOfFrames: null,
};

function normaliseDicomDate(value: string | undefined): string | null {
  if (!value) return null;
  return /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value;
}

/**
 * Reads the allow-listed attributes from the DICOM dataset the loader already
 * parsed for this `fileUrl` (the same URL we handed to Cornerstone, so no extra
 * network round-trip happens). Returns empty metadata instead of throwing when
 * the dataset is missing or malformed.
 */
export function readStudyMetadata(fileUrl: string): StudyMetadata {
  try {
    const dataSet = wadouri.dataSetCacheManager.get(fileUrl);
    if (!dataSet) return EMPTY_STUDY_METADATA;

    const frames = dataSet.intString(ALLOWED_TAGS.numberOfFrames);

    return {
      modality: dataSet.string(ALLOWED_TAGS.modality) ?? null,
      studyDate: normaliseDicomDate(dataSet.string(ALLOWED_TAGS.studyDate)),
      rows: dataSet.uint16(ALLOWED_TAGS.rows) ?? null,
      columns: dataSet.uint16(ALLOWED_TAGS.columns) ?? null,
      numberOfFrames: Number.isFinite(frames) ? (frames as number) : 1,
    };
  } catch {
    return EMPTY_STUDY_METADATA;
  }
}
