export type FileAsset = {
  url: string
  filename?: string
}

export type Solicitud = {
  id: string
  ejecutivoDeVentas?: string
  nombreYaavser?: string
  telefonoDeContacto?: string
  claveYaavser?: string
  puntoDeVenta?: string
  estado?: string
  municipioAlcaldia?: string
  ubicacionGoogleMaps?: string
  fotoExterior?: FileAsset[]
  tipoDeZona?: string
  flujoDePersonas?: string
  serviciosActuales?: string[]
  otroServicio?: string
  fechaBtl?: string
  horaDeInicio?: string
  permisoConfirmado?: string
  evidenciaDePermiso?: FileAsset[]
  medidasDelEspacio?: string
  materialesRequeridos?: string[]
  entregaDePromocionales?: string[]
  aportacionDelYaavser?: string
  detalleDeAportacion?: string
  observaciones?: string
  source?: {
    type?: string
    sessionId?: string
    flowPublicId?: string
  }
}

export type SolicitudesResponse = {
  records: Solicitud[]
  total: number
  hasMore?: boolean
}

export type Filters = {
  search: string
  estado: string
  flujo: string
  fechaFrom: string
  fechaTo: string
}
