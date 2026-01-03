export function renderStaffHeatmap(staffLoad: Record<string, Record<string, number>>) {
  console.log("Staff Load:", staffLoad);

  const canvas = document.getElementById("staffHeatmap") as HTMLCanvasElement | null;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if ((window as any).staffHeatmapChart) {
    (window as any).staffHeatmapChart.destroy();
  }

  const roles = Object.keys(staffLoad);
  const buckets = ["12-14", "14-16", "16-18", "18-21"];

  (window as any).staffHeatmapChart = new (window as any).Chart(ctx, {
    type: "matrix",
    data: {
      datasets: [
        {
          label: "Staff Workload Heatmap",
          data: roles.flatMap(role =>
            buckets.map(bucket => ({
              x: bucket,
              y: role,
              v: staffLoad[role][bucket],
            }))
          ),

          // ⭐⭐⭐ 小方塊尺寸（不會再遮到 X 軸）
          width: () => 32,
          height: () => 20,

          // 顏色
          backgroundColor: (c: any) => {
            const raw = c.raw;
            const alpha = raw.v === 0 ? 0.05 : 0.2 + raw.v * 0.15;
            return `rgba(0,122,255,${alpha})`;
          }
        },
      ],
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      // ⭐⭐⭐ 底部多留空間，避免文字被壓掉
      layout: { padding: { bottom: 40 } },

      scales: {
        x: {
          type: "category",
          labels: buckets,
          title: { display: true, text: "時段" },
          ticks: { padding: 10 }
        },
        y: {
          type: "category",
          labels: roles,
          title: { display: true, text: "角色" }
        }
      },

      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            label: (ctx: { raw: any }) =>
              `${ctx.raw.y} @ ${ctx.raw.x}: ${ctx.raw.v} 件工作量`
          }
        }
      }
    }
  });
}

