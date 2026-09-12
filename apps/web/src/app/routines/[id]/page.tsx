import { Routines } from '../../../features/routines'
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <Routines id={id} /> }
