# ============================================================
# CONFIGURAÇÃO COMERCIAL DOS PLANOS - PSI ANALYTICS
# Plugável no pipeline
# ============================================================

PLANOS_PSI: dict[str, dict] = {
    "avulso": {
        "nome": "Análise Avulsa",
        "preco_mensal": 149.99,
        "analises_mes": 1,
        "area_max_km2": 2500,
        "max_alvos": 5,
        "raio_max_alvo_km": 10,
        "descricao": "1 análise individual de até 2.500 km², com até 5 alvos.",
    },
    "basico": {
        "nome": "Plano Básico",
        "preco_mensal": 299.99,
        "analises_mes": 5,
        "area_max_km2": 5000,
        "max_alvos": 5,
        "raio_max_alvo_km": 10,
        "descricao": "5 análises/mês de até 5.000 km², com até 5 alvos.",
    },
    "pro": {
        "nome": "Plano Pro",
        "preco_mensal": 699.99,
        "analises_mes": 15,
        "area_max_km2": 5000,
        "max_alvos": 5,
        "raio_max_alvo_km": 10,
        "descricao": "15 análises/mês de até 5.000 km², com até 5 alvos.",
    },
    "enterprise": {
        "nome": "Plano Enterprise",
        "preco_mensal": 1499.99,
        "analises_mes": -1,       # -1 = ilimitado
        "area_max_km2": -1,       # -1 = ilimitado (acima de 5.000 km², custom)
        "max_alvos": -1,          # -1 = custom/ilimitado
        "raio_max_alvo_km": -1,   # -1 = custom/ilimitado
        "descricao": "Análises ilimitadas, área acima de 5.000 km², alvos e raio customizados.",
    },
}

# Mapeamento de plan_slug (BD) → chave em PLANOS_PSI
PLAN_SLUG_MAP: dict[str, str] = {
    "basic":      "basico",
    "pro":        "pro",
    "enterprise": "enterprise",
}


# ============================================================
# VALIDAÇÃO DO PLANO
# ============================================================

def validar_limites_plano(
    plano_id: str,
    area_bbox_km2: float,
    numero_alvos: int,
    raio_alvo_km: float,
    analises_realizadas_mes: int = 0,
) -> dict:
    """
    Verifica se os parâmetros da análise cabem no plano informado.

    Retorna::
        {
            "aprovado": bool,
            "plano":    str,   # nome legível do plano
            "erros":    list[str],
        }

    -1 em qualquer limite significa ilimitado.
    """
    plano_id = plano_id.lower()

    if plano_id not in PLANOS_PSI:
        raise ValueError(f"Plano inválido: '{plano_id}'. Opções: {list(PLANOS_PSI)}")

    plano = PLANOS_PSI[plano_id]
    erros: list[str] = []

    if plano["area_max_km2"] != -1 and area_bbox_km2 > plano["area_max_km2"]:
        erros.append(
            f"Área excedida: {area_bbox_km2:.2f} km². "
            f"Limite do plano: {plano['area_max_km2']} km²."
        )

    if plano["max_alvos"] != -1 and numero_alvos > plano["max_alvos"]:
        erros.append(
            f"Número de alvos excedido: {numero_alvos}. "
            f"Limite do plano: {plano['max_alvos']} alvos."
        )

    if plano["raio_max_alvo_km"] != -1 and raio_alvo_km > plano["raio_max_alvo_km"]:
        erros.append(
            f"Raio de alvo excedido: {raio_alvo_km} km. "
            f"Limite do plano: {plano['raio_max_alvo_km']} km."
        )

    if plano["analises_mes"] != -1 and analises_realizadas_mes >= plano["analises_mes"]:
        erros.append(
            f"Cota mensal atingida: {analises_realizadas_mes}/{plano['analises_mes']} análises."
        )

    return {
        "aprovado": len(erros) == 0,
        "plano": plano["nome"],
        "erros": erros,
    }


def bbox_area_km2(lon_min: float, lat_min: float, lon_max: float, lat_max: float) -> float:
    """
    Estimativa da área do bounding-box em km².
    Usa a latitude central para converter graus → km.
    """
    import math

    lat_mid = math.radians((lat_min + lat_max) / 2)
    km_per_deg_lat = 111.32
    km_per_deg_lon = 111.32 * math.cos(lat_mid)

    width_km  = abs(lon_max - lon_min) * km_per_deg_lon
    height_km = abs(lat_max - lat_min) * km_per_deg_lat

    return width_km * height_km
