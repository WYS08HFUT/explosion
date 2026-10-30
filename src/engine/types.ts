export interface SpinSpec {
  axis: [number, number, number];
  rev_per_s: number;
}

export interface PartSpec {
  node: string;
  role: 'part' | 'flow';
  title: string;
  description: string;
  explode_offset: [number, number, number];
  explode_order: number;
  cut?: boolean;
  spin?: SpinSpec;
  materials?: string[];
}

export interface FlowSpec {
  node: string;
  medium: string;
  color: [number, number, number];
  length_m: number;
  label?: string | null;
  style?: string;
  period_s?: number;
  lines?: number;
}

export interface EngineReference {
  engine: string;
  published: {
    thrust_sl_kN: number;
    isp_sl_s: number;
    isp_vac_s: number;
    chamber_pressure_bar: number;
    expansion_ratio: number;
    mixture_ratio: number;
    propellants: string;
    dry_mass_kg: number;
    length_m: number;
    max_diameter_m: number;
    cooling: string;
  };
  note?: string;
}

export interface EngineManifest {
  id: string;
  title: string;
  description: string;
  thrust_axis?: string;
  reference?: EngineReference;
  parts: PartSpec[];
  flows: FlowSpec[];
}
