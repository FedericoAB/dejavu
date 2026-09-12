import { Overview } from '../../../features/overview'
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <Overview runId={id} /> }
