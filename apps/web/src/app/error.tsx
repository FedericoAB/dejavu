'use client'
import { ErrorState } from '../shared/ui'
export default function ErrorPage({ reset }: { reset: () => void }) { return <ErrorState message="No pudimos mostrar esta vista. Podés volver a cargarla para recuperar el estado." retry={reset} /> }
