"""
Módulos complementares GeoAnalytics / PSI Analytics
  1) Detecção de zonas prioritárias
  2) Geração automática de subalvos
  3) Análise radial por alvo
  4) Geração de relatório PDF técnico
"""

import io
import os
from typing import Any

import matplotlib
matplotlib.use("Agg")  # backend sem janela (headless)
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.backends.backend_pdf import PdfPages
from scipy.ndimage import center_of_mass, find_objects, label, maximum_filter


# ============================================================
# UTILITÁRIOS
# ============================================================

def _haversine_km(lon1, lat1, lon2, lat2):
    R = 6371.0
    lon1, lat1, lon2, lat2 = map(np.radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return 2 * R * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def _pixel_to_coord(ix, iy, bbox, grid_w, grid_h):
    lon = bbox["lonMin"] + (ix / max(grid_w - 1, 1)) * (bbox["lonMax"] - bbox["lonMin"])
    lat = bbox["latMin"] + (iy / max(grid_h - 1, 1)) * (bbox["latMax"] - bbox["latMin"])
    return lon, lat


def _pixel_area_km2(bbox, grid_w, grid_h):
    center_lat = (bbox["latMin"] + bbox["latMax"]) / 2
    width_km = _haversine_km(bbox["lonMin"], center_lat, bbox["lonMax"], center_lat)
    height_km = _haversine_km(bbox["lonMin"], bbox["latMin"], bbox["lonMin"], bbox["latMax"])
    return (width_km / max(grid_w, 1)) * (height_km / max(grid_h, 1))


def _radial_mask(target, bbox, grid_w, grid_h, radius_km):
    lons = np.linspace(bbox["lonMin"], bbox["lonMax"], grid_w)
    lats = np.linspace(bbox["latMin"], bbox["latMax"], grid_h)
    X, Y = np.meshgrid(lons, lats)
    dist = _haversine_km(target["lon"], target["lat"], X, Y)
    return dist <= radius_km


# ============================================================
# 1) DETECÇÃO DE ZONAS PRIORITÁRIAS
# ============================================================

def detect_priority_zones(
    score_grid: np.ndarray,
    config: dict,
    targets: list | None = None,
    top_percent: float = 5,
    radius_km: float = 20,
    min_area_km2: float = 0.05,
    max_zones_per_target: int = 5,
) -> pd.DataFrame:
    """Detecta zonas contíguas de alta favorabilidade dentro do raio de cada alvo."""
    bbox = config["bbox"]
    grid_h, grid_w = score_grid.shape
    px_area = _pixel_area_km2(bbox, grid_w, grid_h)
    targets = targets or config.get("targets", [])
    all_zones = []

    for target in targets:
        radial_mask = _radial_mask(target, bbox, grid_w, grid_h, radius_km)
        local_values = score_grid[radial_mask]
        if local_values.size == 0:
            continue

        threshold = np.percentile(local_values, 100 - top_percent)
        high_mask = (score_grid >= threshold) & radial_mask
        labeled, _ = label(high_mask)
        slices = find_objects(labeled)
        zone_rows = []

        for zone_id, slc in enumerate(slices, start=1):
            if slc is None:
                continue
            zone_mask = labeled == zone_id
            n_pixels = int(zone_mask.sum())
            area_km2 = n_pixels * px_area
            if area_km2 < min_area_km2:
                continue

            values = score_grid[zone_mask]
            mean_score = float(np.nanmean(values))
            peak_score = float(np.nanmax(values))

            cy, cx = center_of_mass(zone_mask)
            centroid_lon, centroid_lat = _pixel_to_coord(cx, cy, bbox, grid_w, grid_h)
            dist_to_target = _haversine_km(
                target["lon"], target["lat"], centroid_lon, centroid_lat
            )
            priority_score = (
                0.50 * peak_score
                + 0.35 * mean_score
                + 0.15 * min(area_km2 / 5.0, 1.0)
            )
            zone_rows.append({
                "Target": target["id"],
                "Zone": zone_id,
                "PriorityScore": round(priority_score, 4),
                "PeakScore": round(peak_score, 4),
                "MeanScore": round(mean_score, 4),
                "Area_km2": round(area_km2, 4),
                "CentroidLon": round(float(centroid_lon), 6),
                "CentroidLat": round(float(centroid_lat), 6),
                "DistanceToTarget_km": round(float(dist_to_target), 3),
                "Threshold": round(float(threshold), 4),
            })

        zone_rows.sort(key=lambda x: x["PriorityScore"], reverse=True)
        all_zones.extend(zone_rows[:max_zones_per_target])

    return pd.DataFrame(all_zones)


# ============================================================
# 2) GERAÇÃO AUTOMÁTICA DE SUBALVOS
# ============================================================

def detect_subtargets(
    score_grid: np.ndarray,
    config: dict,
    targets: list | None = None,
    radius_km: float = 20,
    min_distance_pixels: int = 8,
    threshold_quantile: float = 0.90,
    max_subtargets_per_target: int = 6,
) -> pd.DataFrame:
    """Detecta máximos locais dentro do raio de análise e gera ranking de subalvos."""
    bbox = config["bbox"]
    grid_h, grid_w = score_grid.shape
    targets = targets or config.get("targets", [])
    local_max = score_grid == maximum_filter(score_grid, size=min_distance_pixels)
    rows = []

    for target in targets:
        radial_mask = _radial_mask(target, bbox, grid_w, grid_h, radius_km)
        values = score_grid[radial_mask]
        if values.size == 0:
            continue

        threshold = np.quantile(values, threshold_quantile)
        candidate_mask = local_max & radial_mask & (score_grid >= threshold)
        ys, xs = np.where(candidate_mask)

        candidates = []
        for iy, ix in zip(ys, xs):
            lon, lat = _pixel_to_coord(ix, iy, bbox, grid_w, grid_h)
            score = float(score_grid[iy, ix])
            dist = _haversine_km(target["lon"], target["lat"], lon, lat)
            candidates.append({"Target": target["id"], "Score": score, "Lon": lon, "Lat": lat, "DistanceToTarget_km": dist})

        candidates.sort(key=lambda x: x["Score"], reverse=True)
        for rank, c in enumerate(candidates[:max_subtargets_per_target], start=1):
            rows.append({
                "Target": c["Target"],
                "Rank": rank,
                "Score": round(c["Score"], 5),
                "Lon": round(float(c["Lon"]), 6),
                "Lat": round(float(c["Lat"]), 6),
                "DistanceToTarget_km": round(float(c["DistanceToTarget_km"]), 3),
            })

    return pd.DataFrame(rows)


# ============================================================
# 3) ANÁLISE RADIAL POR ALVO
# ============================================================

def analyze_targets_radially(
    score_grid: np.ndarray,
    layers: dict[str, np.ndarray],
    config: dict,
    radius_km: float = 5,
) -> pd.DataFrame:
    """Gera tabela por alvo: média local, P90, máximo, consistência e risco de dominância."""
    bbox = config["bbox"]
    targets = config.get("targets", [])
    grid_h, grid_w = score_grid.shape
    rows = []

    for target in targets:
        mask = _radial_mask(target, bbox, grid_w, grid_h, radius_km)
        values = score_grid[mask]
        if values.size == 0:
            continue

        layer_means = {}
        for name, grid in layers.items():
            if grid.shape == score_grid.shape:
                layer_means[name] = float(np.nanmean(grid[mask]))

        layer_vals = np.array(list(layer_means.values())) if layer_means else np.array([0.0])
        consistency = float(np.clip(
            1 - (np.nanstd(layer_vals) / (np.nanmean(layer_vals) + 1e-12)), 0, 1
        ))
        total = np.sum(layer_vals) + 1e-12
        dominance_risk = float(np.max(layer_vals / total)) if len(layer_vals) else 0.0

        rows.append({
            "Target": target["id"],
            "Radius_km": radius_km,
            "LocalMean": round(float(np.nanmean(values)), 4),
            "P90": round(float(np.nanpercentile(values, 90)), 4),
            "Max": round(float(np.nanmax(values)), 4),
            "Min": round(float(np.nanmin(values)), 4),
            "Std": round(float(np.nanstd(values)), 4),
            "Consistency": round(consistency, 4),
            "DominanceRisk": round(dominance_risk, 4),
        })

    return pd.DataFrame(rows)


# ============================================================
# 4) GERAÇÃO DE RELATÓRIO PDF TÉCNICO
# ============================================================

def generate_pdf_report(
    score_grid: np.ndarray,
    layers: dict[str, np.ndarray],
    config: dict,
    zones_df: pd.DataFrame,
    subtargets_df: pd.DataFrame,
    target_stats_df: pd.DataFrame,
    title: str = "Relatório Técnico GeoAnalytics",
    synthetic: bool = False,
) -> bytes:
    """
    Gera PDF técnico em memória e retorna bytes.
    Páginas: capa, mapas por camada, favorabilidade, tabelas, subalvos, conclusão.
    """
    bbox = config["bbox"]
    commodity = config.get("commodity", "OURO").upper()
    targets = config.get("targets", [])
    bbox_extent = [bbox["lonMin"], bbox["lonMax"], bbox["latMin"], bbox["latMax"]]

    buf = io.BytesIO()
    with PdfPages(buf) as pdf:

        # --- Página 1: Capa ---
        fig = plt.figure(figsize=(11.69, 8.27))
        ax = fig.add_subplot(111)
        ax.axis("off")
        ax.set_facecolor("#0f172a")
        fig.patch.set_facecolor("#0f172a")

        y = 0.88
        ax.text(0.08, y, title, fontsize=20, fontweight="bold", color="white", transform=ax.transAxes)
        for label_text, val in [
            ("Commodity:", commodity),
            ("BBox lon:", f"{bbox['lonMin']:.3f}° → {bbox['lonMax']:.3f}°"),
            ("BBox lat:", f"{bbox['latMin']:.3f}° → {bbox['latMax']:.3f}°"),
            ("Alvos analisados:", str(len(targets))),
            ("Zonas prioritárias:", str(len(zones_df))),
            ("Subalvos recomendados:", str(len(subtargets_df))),
        ]:
            y -= 0.07
            ax.text(0.08, y, label_text, fontsize=11, color="#94a3b8", transform=ax.transAxes)
            ax.text(0.30, y, val, fontsize=11, fontweight="bold", color="white", transform=ax.transAxes)

        if synthetic:
            ax.text(0.08, y - 0.10,
                    "⚠ DADOS SINTÉTICOS — não representam validação geológica real.",
                    fontsize=11, color="#f87171", transform=ax.transAxes)

        pdf.savefig(fig, facecolor=fig.get_facecolor())
        plt.close(fig)

        # --- Página 2: Mapas por camada ---
        selected = [k for k in ["MAG", "GRAV", "K", "U", "Th"] if k in layers]
        if selected:
            cols = 3
            rows_count = int(np.ceil(len(selected) / cols))
            fig, axes = plt.subplots(rows_count, cols, figsize=(11.69, 8.27))
            fig.patch.set_facecolor("#0f172a")
            axes_flat = np.array(axes).reshape(-1)

            for ax, lname in zip(axes_flat, selected):
                ax.set_facecolor("#0f172a")
                im = ax.imshow(
                    layers[lname], extent=bbox_extent, origin="lower",
                    aspect="auto", cmap="hot"
                )
                ax.set_title(lname, color="white", fontsize=9)
                ax.tick_params(colors="#64748b", labelsize=7)
                for spine in ax.spines.values():
                    spine.set_edgecolor("#334155")
                for t in targets:
                    ax.plot(t["lon"], t["lat"], "x", color="#f59e0b", markersize=5)
                    ax.text(t["lon"], t["lat"], f" {t['id']}", color="white", fontsize=7)
                plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)

            for ax in axes_flat[len(selected):]:
                ax.axis("off")

            fig.suptitle("Camadas geofísicas — normalização RobustScaler 0–1",
                         fontsize=13, fontweight="bold", color="white")
            plt.tight_layout(rect=[0, 0, 1, 0.95])
            pdf.savefig(fig, facecolor=fig.get_facecolor())
            plt.close(fig)

        # --- Página 3: Mapa de favorabilidade ---
        fig, ax = plt.subplots(figsize=(11.69, 8.27))
        fig.patch.set_facecolor("#0f172a")
        ax.set_facecolor("#0f172a")

        im = ax.imshow(score_grid, extent=bbox_extent, origin="lower", aspect="auto", cmap="RdYlGn")
        ax.set_title(f"Mapa Integrado de Favorabilidade — {commodity}",
                     fontsize=14, fontweight="bold", color="white")
        ax.set_xlabel("Longitude", color="#94a3b8")
        ax.set_ylabel("Latitude", color="#94a3b8")
        ax.tick_params(colors="#64748b")
        for spine in ax.spines.values():
            spine.set_edgecolor("#334155")

        for t in targets:
            ax.plot(t["lon"], t["lat"], "x", color="#f59e0b", markersize=9, markeredgewidth=2)
            ax.text(t["lon"], t["lat"], f"  {t['id']}", color="white", fontsize=9, fontweight="bold")

        if not zones_df.empty:
            ax.scatter(
                zones_df["CentroidLon"], zones_df["CentroidLat"],
                s=50, marker="o", c="#60a5fa", label="Zonas prioritárias",
                zorder=5, alpha=0.8,
            )
            ax.legend(facecolor="#1e293b", edgecolor="#334155", labelcolor="white")

        plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04, label="Score 0–1")
        plt.tight_layout()
        pdf.savefig(fig, facecolor=fig.get_facecolor())
        plt.close(fig)

        # --- Página 4: Análise radial por alvo ---
        if not target_stats_df.empty:
            fig, ax = plt.subplots(figsize=(11.69, 8.27))
            fig.patch.set_facecolor("#0f172a")
            ax.axis("off")
            ax.text(0.5, 0.97, "Análise Radial por Alvo",
                    fontsize=14, fontweight="bold", ha="center", va="top",
                    color="white", transform=ax.transAxes)

            tbl = ax.table(
                cellText=target_stats_df.round(4).values,
                colLabels=target_stats_df.columns.tolist(),
                loc="center",
                cellLoc="center",
            )
            tbl.auto_set_font_size(False)
            tbl.set_fontsize(8)
            tbl.scale(1, 1.5)
            for (r, c), cell in tbl.get_celld().items():
                cell.set_facecolor("#1e293b" if r > 0 else "#334155")
                cell.set_edgecolor("#475569")
                cell.set_text_props(color="white")

            pdf.savefig(fig, facecolor=fig.get_facecolor())
            plt.close(fig)

        # --- Página 5: Zonas prioritárias ---
        if not zones_df.empty:
            top20 = zones_df.sort_values("PriorityScore", ascending=False).head(20)
            fig, ax = plt.subplots(figsize=(11.69, 8.27))
            fig.patch.set_facecolor("#0f172a")
            ax.axis("off")
            ax.text(0.5, 0.97, "Zonas Prioritárias Detectadas",
                    fontsize=14, fontweight="bold", ha="center", va="top",
                    color="white", transform=ax.transAxes)

            tbl = ax.table(
                cellText=top20.round(4).values,
                colLabels=top20.columns.tolist(),
                loc="center",
                cellLoc="center",
            )
            tbl.auto_set_font_size(False)
            tbl.set_fontsize(7)
            tbl.scale(1, 1.3)
            for (r, c), cell in tbl.get_celld().items():
                cell.set_facecolor("#1e293b" if r > 0 else "#334155")
                cell.set_edgecolor("#475569")
                cell.set_text_props(color="white")

            pdf.savefig(fig, facecolor=fig.get_facecolor())
            plt.close(fig)

        # --- Página 6: Subalvos recomendados ---
        if not subtargets_df.empty:
            top30 = subtargets_df.sort_values(["Target", "Rank"]).head(30)
            fig, ax = plt.subplots(figsize=(11.69, 8.27))
            fig.patch.set_facecolor("#0f172a")
            ax.axis("off")
            ax.text(0.5, 0.97, "Subalvos Recomendados",
                    fontsize=14, fontweight="bold", ha="center", va="top",
                    color="white", transform=ax.transAxes)

            tbl = ax.table(
                cellText=top30.round(5).values,
                colLabels=top30.columns.tolist(),
                loc="center",
                cellLoc="center",
            )
            tbl.auto_set_font_size(False)
            tbl.set_fontsize(8)
            tbl.scale(1, 1.4)
            for (r, c), cell in tbl.get_celld().items():
                cell.set_facecolor("#1e293b" if r > 0 else "#334155")
                cell.set_edgecolor("#475569")
                cell.set_text_props(color="white")

            pdf.savefig(fig, facecolor=fig.get_facecolor())
            plt.close(fig)

        # --- Página final: Conclusão ---
        fig = plt.figure(figsize=(11.69, 8.27))
        fig.patch.set_facecolor("#0f172a")
        ax = fig.add_subplot(111)
        ax.axis("off")
        ax.set_facecolor("#0f172a")

        ax.text(0.08, 0.92, "Conclusão Interpretativa",
                fontsize=16, fontweight="bold", color="white", transform=ax.transAxes)

        if not zones_df.empty:
            top_zone = zones_df.sort_values("PriorityScore", ascending=False).iloc[0]
            body = (
                f"A análise integrada para {commodity} identificou zonas de favorabilidade relativa "
                f"a partir do score PSI composto. A zona de maior prioridade foi associada ao alvo "
                f"{top_zone['Target']}, com PriorityScore {top_zone['PriorityScore']}, "
                f"PeakScore {top_zone['PeakScore']} e área estimada de {top_zone['Area_km2']} km².\n\n"
            )
        else:
            body = (
                f"A análise integrada para {commodity} não identificou zonas prioritárias "
                "acima dos critérios mínimos definidos.\n\n"
            )

        body += (
            "O score apresentado é um indicador relativo de favorabilidade exploratória. "
            "Ele não representa teor, reserva mineral, recurso medido ou viabilidade econômica. "
            "Os alvos informados funcionam como referências de análise local; a priorização "
            "emerge das zonas e subalvos detectados no entorno.\n\n"
            "Recomenda-se utilizar os resultados como suporte à decisão para planejamento de "
            "mapeamento geológico, geoquímica e validação de campo antes de qualquer sondagem."
        )

        ax.text(0.08, 0.80, body, fontsize=11, color="#cbd5e1",
                transform=ax.transAxes, va="top", wrap=True,
                multialignment="left",
                bbox=dict(boxstyle="round,pad=0.4", facecolor="#1e293b", edgecolor="#334155"))

        pdf.savefig(fig, facecolor=fig.get_facecolor())
        plt.close(fig)

    buf.seek(0)
    return buf.read()


# ============================================================
# CLASSIFICAÇÃO E ENRIQUECIMENTO
# ============================================================

def _classify_zones(zones_df: pd.DataFrame) -> pd.DataFrame:
    """Adiciona coluna 'Classe' (Alta / Média / Baixa) por percentil do PriorityScore."""
    if zones_df.empty:
        return zones_df
    df = zones_df.copy()
    q66 = df["PriorityScore"].quantile(0.66)
    q33 = df["PriorityScore"].quantile(0.33)
    df["Classe"] = df["PriorityScore"].apply(
        lambda s: "Alta" if s >= q66 else ("Média" if s >= q33 else "Baixa")
    )
    return df


def _add_subtarget_justification(subtargets_df: pd.DataFrame) -> pd.DataFrame:
    """Adiciona coluna 'Justificativa' baseada no Score PSI."""
    if subtargets_df.empty:
        return subtargets_df
    df = subtargets_df.copy()

    def _justify(s):
        if s >= 0.80:
            return "Máximo local de alta favorabilidade — candidato primário"
        elif s >= 0.65:
            return "Máximo local moderado — candidato secundário"
        elif s >= 0.50:
            return "Máximo local abaixo da média — candidato exploratório"
        return "Score baixo — reavaliação recomendada"

    df["Justificativa"] = df["Score"].apply(_justify)
    return df


# ============================================================
# 5) MAPA 2D DE FAVORABILIDADE — PNG
# ============================================================

def generate_favorability_png(
    score_grid: np.ndarray,
    config: dict,
    zones_df: pd.DataFrame,
    subtargets_df: pd.DataFrame,
) -> bytes:
    """
    Gera PNG do mapa 2D de favorabilidade com:
      - Heatmap do score PSI
      - Contornos top 5%, 10%, 20%
      - Centroides das zonas prioritárias
      - Subalvos recomendados
      - Alvos do cliente
    """
    bbox = config["bbox"]
    commodity = config.get("commodity", "OURO")
    targets = config.get("targets", [])
    bbox_extent = [bbox["lonMin"], bbox["lonMax"], bbox["latMin"], bbox["latMax"]]

    lons = np.linspace(bbox["lonMin"], bbox["lonMax"], score_grid.shape[1])
    lats = np.linspace(bbox["latMin"], bbox["latMax"], score_grid.shape[0])

    fig, ax = plt.subplots(figsize=(12, 9))
    fig.patch.set_facecolor("#0f172a")
    ax.set_facecolor("#0f172a")

    # Heatmap
    im = ax.imshow(
        score_grid, extent=bbox_extent, origin="lower",
        aspect="auto", cmap="RdYlGn", alpha=0.88, vmin=0, vmax=1,
    )

    # Contornos: top 5% / 10% / 20%
    contour_spec = [
        (95, "#ef4444", "Top 5%",  2.0),
        (90, "#f97316", "Top 10%", 1.5),
        (80, "#eab308", "Top 20%", 1.0),
    ]
    for pct, color, lbl, lw in contour_spec:
        level = float(np.percentile(score_grid, pct))
        cs = ax.contour(lons, lats, score_grid, levels=[level],
                        colors=[color], linewidths=[lw], alpha=0.9)
        if cs.collections:
            cs.collections[0].set_label(lbl)

    # Centroides das zonas
    if not zones_df.empty:
        ax.scatter(
            zones_df["CentroidLon"], zones_df["CentroidLat"],
            s=70, marker="D", c="#60a5fa", zorder=8, alpha=0.90,
            edgecolors="white", linewidths=0.5, label="Centroide de zona",
        )

    # Subalvos top-10
    if not subtargets_df.empty and "Lon" in subtargets_df.columns:
        top_subs = subtargets_df.sort_values("Score", ascending=False).head(10)
        ax.scatter(
            top_subs["Lon"], top_subs["Lat"],
            s=45, marker="^", c="#a78bfa", zorder=9, alpha=0.90,
            edgecolors="white", linewidths=0.4, label="Subalvo",
        )

    # Alvos do cliente
    for t in targets:
        ax.plot(t["lon"], t["lat"], "*",
                color="#f59e0b", markersize=14, markeredgewidth=0.8,
                markeredgecolor="white", zorder=10)
        ax.text(t["lon"] + 0.025, t["lat"] + 0.015, t["id"],
                color="white", fontsize=8, fontweight="bold",
                zorder=11, bbox=dict(boxstyle="round,pad=0.2",
                                     facecolor="#0f172a", alpha=0.7, edgecolor="none"))

    ax.set_title(f"Mapa de Favorabilidade — {commodity}",
                 color="white", fontsize=14, fontweight="bold", pad=12)
    ax.set_xlabel("Longitude", color="#94a3b8", fontsize=10)
    ax.set_ylabel("Latitude", color="#94a3b8", fontsize=10)
    ax.tick_params(colors="#64748b", labelsize=8)
    for spine in ax.spines.values():
        spine.set_edgecolor("#334155")

    cbar = plt.colorbar(im, ax=ax, fraction=0.03, pad=0.02)
    cbar.set_label("Score PSI  0 → 1", color="#94a3b8", fontsize=9)
    cbar.ax.tick_params(colors="#64748b", labelsize=8)

    legend = ax.legend(
        loc="lower right", facecolor="#1e293b",
        edgecolor="#334155", labelcolor="white", fontsize=8,
    )

    ax.text(
        0.01, 0.01,
        "⚠ Score indica favorabilidade relativa — não é teor, reserva ou profundidade",
        color="#64748b", fontsize=7, transform=ax.transAxes, va="bottom",
    )

    plt.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=96,
                facecolor=fig.get_facecolor(), bbox_inches="tight")
    plt.close(fig)
    return buf.getvalue()


# ============================================================
# 6) MAPA 3D INTERATIVO — HTML + Plotly CDN
# ============================================================

def generate_3d_html(
    score_grid: np.ndarray,
    config: dict,
    subtargets_df: pd.DataFrame,
) -> bytes:
    """
    Gera HTML interativo com superfície 3D de favorabilidade via Plotly CDN.
    Eixo Z = Score PSI (não é profundidade geológica).
    """
    import json

    bbox = config["bbox"]
    commodity = config.get("commodity", "OURO")
    targets = config.get("targets", [])

    # Downsample para performance no browser (máx 80×80)
    h, w = score_grid.shape
    step_h = max(1, h // 80)
    step_w = max(1, w // 80)
    grid_ds = score_grid[::step_h, ::step_w]
    h2, w2 = grid_ds.shape

    lons = np.linspace(bbox["lonMin"], bbox["lonMax"], w2).tolist()
    lats = np.linspace(bbox["latMin"], bbox["latMax"], h2).tolist()
    z_data = np.round(grid_ds, 4).tolist()

    plot_data = [
        {
            "type": "surface",
            "x": lons,
            "y": lats,
            "z": z_data,
            "colorscale": "RdYlGn",
            "opacity": 0.92,
            "showscale": True,
            "colorbar": {
                "title": {"text": "Score PSI", "font": {"color": "#94a3b8"}},
                "tickfont": {"color": "#94a3b8"},
            },
            "name": "Favorabilidade",
            "hovertemplate": "Lon: %{x:.3f}<br>Lat: %{y:.3f}<br>PSI: %{z:.3f}<extra></extra>",
        }
    ]

    # Subalvos como scatter3d
    if not subtargets_df.empty and "Lon" in subtargets_df.columns:
        top_subs = subtargets_df.sort_values("Score", ascending=False).head(12)
        plot_data.append({
            "type": "scatter3d",
            "mode": "markers+text",
            "x": top_subs["Lon"].round(4).tolist(),
            "y": top_subs["Lat"].round(4).tolist(),
            "z": (top_subs["Score"] + 0.02).round(4).tolist(),
            "text": [f"Sub {r}" for r in top_subs["Rank"].tolist()],
            "marker": {"size": 5, "color": "#a78bfa", "symbol": "diamond",
                       "line": {"color": "white", "width": 0.5}},
            "textfont": {"color": "white", "size": 8},
            "name": "Subalvos",
            "hovertemplate": "Lon: %{x:.4f}<br>Lat: %{y:.4f}<br>Score: %{z:.3f}<extra>Subalvo</extra>",
        })

    # Alvos do cliente
    for t in targets:
        z_val = float(t.get("psiScore", 0.5)) + 0.04
        plot_data.append({
            "type": "scatter3d",
            "mode": "markers+text",
            "x": [float(t["lon"])],
            "y": [float(t["lat"])],
            "z": [z_val],
            "text": [t["id"]],
            "marker": {"size": 9, "color": "#f59e0b", "symbol": "diamond",
                       "line": {"color": "white", "width": 1}},
            "textfont": {"color": "white", "size": 10, "family": "bold"},
            "name": t["id"],
            "hovertemplate": f"Alvo {t['id']}<br>PSI: {z_val:.3f}<extra></extra>",
        })

    layout = {
        "title": {
            "text": f"Superfície 3D de Favorabilidade — {commodity}",
            "font": {"color": "white", "size": 16},
        },
        "scene": {
            "xaxis": {"title": "Longitude", "titlefont": {"color": "#94a3b8"},
                      "tickfont": {"color": "#64748b"}, "gridcolor": "#334155",
                      "backgroundcolor": "#0f172a"},
            "yaxis": {"title": "Latitude", "titlefont": {"color": "#94a3b8"},
                      "tickfont": {"color": "#64748b"}, "gridcolor": "#334155",
                      "backgroundcolor": "#0f172a"},
            "zaxis": {"title": "Score PSI (0–1)", "titlefont": {"color": "#94a3b8"},
                      "tickfont": {"color": "#64748b"}, "gridcolor": "#334155",
                      "backgroundcolor": "#0f172a", "range": [0, 1]},
            "bgcolor": "#0f172a",
        },
        "paper_bgcolor": "#0f172a",
        "plot_bgcolor": "#0f172a",
        "font": {"color": "white"},
        "legend": {"font": {"color": "white"}, "bgcolor": "#1e293b",
                   "bordercolor": "#334155", "borderwidth": 1},
        "margin": {"l": 0, "r": 0, "t": 50, "b": 40},
        "annotations": [{
            "text": "⚠ Eixo Z = Score PSI de favorabilidade — NÃO representa profundidade geológica",
            "showarrow": False,
            "xref": "paper", "yref": "paper",
            "x": 0.5, "y": -0.04,
            "font": {"color": "#64748b", "size": 10},
            "align": "center",
        }],
    }

    # O iframe carrega Plotly direto do CDN (tentativa window.parent causava
    # SecurityError porque sandbox=allow-scripts forca origin:null no iframe).
    html = (
        "<!DOCTYPE html><html><head>"
        '<meta charset="utf-8">'
        '<script src="https://cdn.plot.ly/plotly-2.27.0.min.js" charset="utf-8"></script>'
        "<style>*{margin:0;padding:0;box-sizing:border-box}"
        "body{background:#0f172a}#plot{width:100vw;height:100vh}</style>"
        "</head><body><div id=\"plot\"></div><script>"
        f"var data={json.dumps(plot_data, separators=(',',':'))};"
        f"var layout={json.dumps(layout, separators=(',',':'))};"
        "Plotly.newPlot('plot',data,layout,{responsive:true,displayModeBar:true});"
        "</script></body></html>"
    )
    return html.encode("utf-8")


# ============================================================
# ORQUESTRADOR PRINCIPAL
# ============================================================

def run_full_output_pipeline(
    psi_grid: np.ndarray,
    normalized_layers: dict[str, np.ndarray],
    config: dict,
) -> dict[str, Any]:
    """
    Recebe o grid PSI + camadas normalizadas + config do pipeline.
    Retorna zonas, subalvos, stats radiais e bytes do PDF.
    """
    radius_km = config.get("radiusKm", 20)
    demo = config.get("_demo", False)

    zones_df = detect_priority_zones(
        score_grid=psi_grid,
        config=config,
        radius_km=radius_km,
        top_percent=15 if demo else 5,
        min_area_km2=0.05,
        max_zones_per_target=5,
    )
    zones_df = _classify_zones(zones_df)

    subtargets_df = detect_subtargets(
        score_grid=psi_grid,
        config=config,
        radius_km=radius_km,
        min_distance_pixels=8,
        threshold_quantile=0.85 if demo else 0.90,
        max_subtargets_per_target=6,
    )
    subtargets_df = _add_subtarget_justification(subtargets_df)

    # Fallback demo: garante subalvos mesmo se detect_subtargets retornar vazio
    if demo and subtargets_df.empty:
        from app.services.demo_synthetic import fallback_subtargets
        import pandas as pd
        subtargets_df = pd.DataFrame(fallback_subtargets(psi_grid, config))
        subtargets_df = _add_subtarget_justification(subtargets_df)

    target_stats_df = analyze_targets_radially(
        score_grid=psi_grid,
        layers=normalized_layers,
        config=config,
        radius_km=min(radius_km, 10),
    )

    # Gerar PNG 2D e HTML 3D (rápido — incluídos no pipeline)
    try:
        map_png = generate_favorability_png(psi_grid, config, zones_df, subtargets_df)
    except Exception:
        map_png = b""

    try:
        map_3d_html = generate_3d_html(psi_grid, config, subtargets_df)
    except Exception:
        map_3d_html = b""

    # Serializar para JSON-safe
    def df_to_records(df):
        return df.to_dict(orient="records") if not df.empty else []

    return {
        "zones": df_to_records(zones_df),
        "subtargets": df_to_records(subtargets_df),
        "targetStats": df_to_records(target_stats_df),
        # PDF gerado sob demanda em /report
        "pdfBytes": None,
        "mapPng": map_png,
        "map3dHtml": map_3d_html,
        "_pdf_raw": {
            "psi_grid": psi_grid,
            "layers": normalized_layers,
            "zones_df": zones_df,
            "subtargets_df": subtargets_df,
            "target_stats_df": target_stats_df,
        },
    }
