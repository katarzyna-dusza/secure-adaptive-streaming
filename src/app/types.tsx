export interface Representation {
  '@id': string;
  '@codecs': string;
  '@bandwidth': number;
}

export interface SegmentTemplate {
  '@initialization': string;
  '@media': string;
}

export interface AdaptationSet {
  Representation: Representation[];
  SegmentTemplate: SegmentTemplate;
  '@mimeType': string;
}

export interface Period {
  AdaptationSet: AdaptationSet[];
}

export interface Manifest {
  MPD?: {
    Period: Period[]
  }
}