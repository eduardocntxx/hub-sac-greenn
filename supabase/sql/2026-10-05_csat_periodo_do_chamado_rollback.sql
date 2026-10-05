-- Restaura as 10 funções a partir do backup gravado antes da troca.
do $$
declare r record;
begin
  for r in select sig, def from public._bkp_funcoes_csat_2026_10_05 loop
    execute r.def;
  end loop;
end $$;
