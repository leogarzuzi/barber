import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { descriptografarToken } from "./crypto";
import { renovarAccessToken } from "./oauth";

const apiGoogle = "https://www.googleapis.com/calendar/v3";
export const nomeCalendarioGoogle = "PH10 — Reservas";

type ConexaoGoogle = {
  owner_id: string;
  google_email: string;
  calendar_id: string;
  calendar_nome: string;
  refresh_token_criptografado: string | null;
  conectado: boolean;
};

type AgendamentoGoogle = {
  id: string;
  cliente_nome: string;
  item_nome: string;
  data: string;
  hora: string;
  duracao_minutos: number;
  status: string;
  google_event_id: string | null;
};

async function googleFetch(
  caminho: string,
  accessToken: string,
  init: RequestInit = {},
) {
  const resposta = await fetch(`${apiGoogle}${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });

  return resposta;
}

async function erroGoogle(resposta: Response) {
  const corpo = (await resposta.text()).slice(0, 500);
  return new Error(`Google Calendar respondeu ${resposta.status}: ${corpo}`);
}

export async function criarCalendarioGoogle(accessToken: string, timezone: string) {
  const resposta = await googleFetch("/calendars", accessToken, {
    method: "POST",
    body: JSON.stringify({
      summary: nomeCalendarioGoogle,
      description: "Reservas criadas pelo sistema PH10.",
      timeZone: timezone,
    }),
  });

  if (!resposta.ok) throw await erroGoogle(resposta);
  const calendario = await resposta.json() as { id: string; summary?: string };
  return {
    id: calendario.id,
    nome: calendario.summary || nomeCalendarioGoogle,
  };
}

export async function calendarioGoogleExiste(accessToken: string, calendarId: string) {
  const resposta = await googleFetch(`/calendars/${encodeURIComponent(calendarId)}`, accessToken);
  if (resposta.status === 404 || resposta.status === 410) return false;
  if (!resposta.ok) throw await erroGoogle(resposta);
  return true;
}

function idEventoGoogle(agendamentoId: string) {
  return `ph10${agendamentoId.replaceAll("-", "").toLowerCase()}`;
}

function somarMinutos(data: string, hora: string, duracao: number) {
  const [ano, mes, dia] = data.split("-").map(Number);
  const [horas, minutos] = hora.slice(0, 5).split(":").map(Number);
  const instante = new Date(Date.UTC(ano, mes - 1, dia, horas, minutos + duracao));
  return {
    data: [
      instante.getUTCFullYear(),
      String(instante.getUTCMonth() + 1).padStart(2, "0"),
      String(instante.getUTCDate()).padStart(2, "0"),
    ].join("-"),
    hora: `${String(instante.getUTCHours()).padStart(2, "0")}:${String(instante.getUTCMinutes()).padStart(2, "0")}`,
  };
}

function corpoEvento(agendamento: AgendamentoGoogle, timezone: string) {
  const fim = somarMinutos(agendamento.data, agendamento.hora, agendamento.duracao_minutos);
  return {
    summary: `${agendamento.cliente_nome} — ${agendamento.item_nome}`,
    start: {
      dateTime: `${agendamento.data}T${agendamento.hora.slice(0, 5)}:00`,
      timeZone: timezone,
    },
    end: {
      dateTime: `${fim.data}T${fim.hora}:00`,
      timeZone: timezone,
    },
    transparency: "opaque",
    visibility: "private",
    extendedProperties: {
      private: {
        ph10AgendamentoId: agendamento.id,
        criadoPeloPh10: "true",
      },
    },
  };
}

async function inserirEvento(
  accessToken: string,
  calendarId: string,
  agendamento: AgendamentoGoogle,
  timezone: string,
  eventId: string,
) {
  const resposta = await googleFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    accessToken,
    {
    method: "POST",
    body: JSON.stringify({
      id: eventId,
      ...corpoEvento(agendamento, timezone),
    }),
    },
  );
  if (!resposta.ok) throw await erroGoogle(resposta);
}

async function atualizarOuInserirEvento(
  accessToken: string,
  calendarId: string,
  agendamento: AgendamentoGoogle,
  timezone: string,
  eventId: string,
) {
  const caminho = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const resposta = await googleFetch(caminho, accessToken, {
    method: "PUT",
    body: JSON.stringify(corpoEvento(agendamento, timezone)),
  });

  if (resposta.status === 404 || resposta.status === 410) {
    await inserirEvento(accessToken, calendarId, agendamento, timezone, eventId);
    return;
  }
  if (!resposta.ok) throw await erroGoogle(resposta);
}

async function removerEvento(accessToken: string, calendarId: string, eventId: string) {
  const resposta = await googleFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    accessToken,
    { method: "DELETE" },
  );
  if (resposta.status === 404 || resposta.status === 410) return;
  if (!resposta.ok) throw await erroGoogle(resposta);
}

async function buscarConexao(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("google_calendar_conexoes")
    .select("owner_id, google_email, calendar_id, calendar_nome, refresh_token_criptografado, conectado")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return data as ConexaoGoogle | null;
}

async function buscarTimezone(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("configuracoes")
    .select("timezone")
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data.timezone as string;
}

export async function sincronizarAgendamentoGoogle(
  supabase: SupabaseClient,
  agendamentoId: string,
) {
  const { data, error } = await supabase
    .from("agendamentos")
    .select("id, cliente_nome, item_nome, data, hora, duracao_minutos, status, google_event_id")
    .eq("id", agendamentoId)
    .single();
  if (error) throw error;

  const agendamento = data as AgendamentoGoogle;
  const conexao = await buscarConexao(supabase);
  const eventId = agendamento.google_event_id || idEventoGoogle(agendamento.id);

  if (!conexao?.conectado || !conexao.refresh_token_criptografado) {
    await supabase
      .from("agendamentos")
      .update({
        google_sync_status: agendamento.status === "cancelado" ? "removido" : "pendente",
        google_sync_error: null,
      })
      .eq("id", agendamento.id);
    return { status: agendamento.status === "cancelado" ? "removido" : "pendente" };
  }

  try {
    const [accessToken, timezone] = await Promise.all([
      renovarAccessToken(descriptografarToken(conexao.refresh_token_criptografado)),
      buscarTimezone(supabase),
    ]);

    if (agendamento.status === "cancelado") {
      await removerEvento(accessToken, conexao.calendar_id, eventId);
      await supabase
        .from("agendamentos")
        .update({
          google_event_id: null,
          google_sync_status: "removido",
          google_sync_error: null,
          google_sincronizado_em: new Date().toISOString(),
        })
        .eq("id", agendamento.id);
      return { status: "removido" };
    }

    if (agendamento.google_event_id) {
      await atualizarOuInserirEvento(
        accessToken,
        conexao.calendar_id,
        agendamento,
        timezone,
        eventId,
      );
    } else {
      try {
        await inserirEvento(accessToken, conexao.calendar_id, agendamento, timezone, eventId);
      } catch (erro) {
        if (!(erro instanceof Error) || !erro.message.includes("respondeu 409")) throw erro;
        await atualizarOuInserirEvento(
          accessToken,
          conexao.calendar_id,
          agendamento,
          timezone,
          eventId,
        );
      }
    }

    await supabase
      .from("agendamentos")
      .update({
        google_event_id: eventId,
        google_sync_status: "sincronizado",
        google_sync_error: null,
        google_sincronizado_em: new Date().toISOString(),
      })
      .eq("id", agendamento.id);
    return { status: "sincronizado" };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message.slice(0, 500) : "Erro desconhecido";
    const credencialExpirada = mensagem.includes('"error": "invalid_grant"');

    if (credencialExpirada) {
      await supabase
        .from("google_calendar_conexoes")
        .update({ conectado: false })
        .eq("id", 1);
    }
    await supabase
      .from("agendamentos")
      .update({ google_sync_status: "erro", google_sync_error: mensagem })
      .eq("id", agendamento.id);
    return { status: "erro", erro: mensagem, reconexaoNecessaria: credencialExpirada };
  }
}

function dataHoje(timezone: string) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

export async function sincronizarReservasFuturas(supabase: SupabaseClient) {
  const timezone = await buscarTimezone(supabase);
  const { data, error } = await supabase
    .from("agendamentos")
    .select("id")
    .neq("status", "cancelado")
    .gte("data", dataHoje(timezone))
    .order("data")
    .order("hora");
  if (error) throw error;

  const resultados = [];
  for (const item of data) {
    resultados.push(await sincronizarAgendamentoGoogle(supabase, item.id));
  }
  return resultados;
}

export async function removerReservasFuturasDoGoogle(supabase: SupabaseClient) {
  const conexao = await buscarConexao(supabase);
  if (!conexao?.refresh_token_criptografado) return { removidos: 0, falhas: 0 };

  const timezone = await buscarTimezone(supabase);
  const { data, error } = await supabase
    .from("agendamentos")
    .select("id, google_event_id")
    .neq("status", "cancelado")
    .gte("data", dataHoje(timezone))
    .not("google_event_id", "is", null);
  if (error) throw error;

  let removidos = 0;
  let falhas = 0;
  try {
    const accessToken = await renovarAccessToken(
      descriptografarToken(conexao.refresh_token_criptografado),
    );
    for (const item of data) {
      try {
        await removerEvento(accessToken, conexao.calendar_id, item.google_event_id);
        removidos += 1;
      } catch {
        falhas += 1;
      }
    }
  } catch {
    falhas = data.length;
  }

  await supabase
    .from("agendamentos")
    .update({
      google_event_id: null,
      google_sync_status: "pendente",
      google_sync_error: null,
      google_sincronizado_em: null,
    })
    .neq("status", "cancelado")
    .gte("data", dataHoje(timezone));

  return { removidos, falhas };
}

export async function resumoGoogleCalendar(supabase: SupabaseClient) {
  const [conexao, timezone] = await Promise.all([
    buscarConexao(supabase),
    buscarTimezone(supabase),
  ]);
  const { count: pendentes, error: erroPendentes } = await supabase
    .from("agendamentos")
    .select("id", { count: "exact", head: true })
    .in("google_sync_status", ["pendente", "erro"])
    .neq("status", "cancelado")
    .gte("data", dataHoje(timezone));
  if (erroPendentes) throw erroPendentes;

  return {
    conectado: Boolean(conexao?.conectado && conexao.refresh_token_criptografado),
    email: conexao?.google_email ?? null,
    calendario: conexao?.calendar_nome ?? null,
    pendentes: pendentes ?? 0,
  };
}
