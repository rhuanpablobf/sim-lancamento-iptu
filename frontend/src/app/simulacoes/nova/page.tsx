/**
 * Redireciona /simulacoes/nova → /nova-simulacao (rota principal)
 */
import { redirect } from "next/navigation";

export default function NovaSimulacaoRedir() {
  redirect("/nova-simulacao");
}
