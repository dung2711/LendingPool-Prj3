"use client";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";

export interface TimeSeriesPoint {
  timestamp: string;
  values: Record<string, number>;
}

export interface TimeSeriesSeries {
  key: string;
  label: string;
  color: string;
}

export interface TimeSeriesChartProps {
  title: string;
  subtitle?: string;
  points: TimeSeriesPoint[];
  series: TimeSeriesSeries[];
  emptyLabel?: string;
  valueFormatter?: (value: number) => string;
}

const chartWidth = 800;
const chartHeight = 280;
const padding = { top: 20, right: 24, bottom: 44, left: 56 };

const formatAxisLabel = (timestamp: string): string =>
  new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

const defaultValueFormatter = (value: number): string => {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1000)
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value.toFixed(2);
};

export function TimeSeriesChart({
  title,
  subtitle,
  points,
  series,
  emptyLabel = "No data available for the selected range.",
  valueFormatter = defaultValueFormatter,
}: TimeSeriesChartProps) {
  const compactPoints = points.slice(-120);

  if (compactPoints.length === 0) {
    return (
      <Card elevation={2}>
        <CardContent>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 1,
            }}
          >
            <Box>
              <Typography variant="h6" fontWeight="bold">
                {title}
              </Typography>
              {subtitle ? (
                <Typography variant="body2" color="text.secondary">
                  {subtitle}
                </Typography>
              ) : null}
            </Box>
          </Box>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ py: 4, textAlign: "center" }}
          >
            {emptyLabel}
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const values = compactPoints.flatMap((point) =>
    series.map((item) => point.values[item.key] ?? 0),
  );
  const maxValue = Math.max(1, ...values);
  const minValue = Math.min(0, ...values);
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  const xDenominator = Math.max(1, compactPoints.length - 1);
  const yScale = (value: number) => {
    const normalized = (value - minValue) / (maxValue - minValue || 1);
    return chartHeight - padding.bottom - normalized * innerHeight;
  };

  const buildPath = (key: string): string =>
    compactPoints
      .map((point, index) => {
        const x = padding.left + (index / xDenominator) * innerWidth;
        const y = yScale(point.values[key] ?? 0);
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");

  const chartLabels = [
    compactPoints[0],
    compactPoints[Math.floor(compactPoints.length / 2)],
    compactPoints[compactPoints.length - 1],
  ];

  return (
    <Card elevation={2}>
      <CardContent>
        <Box
          sx={{
            display: "flex",
            alignItems: { xs: "flex-start", sm: "center" },
            justifyContent: "space-between",
            gap: 2,
            mb: 2,
            flexDirection: { xs: "column", sm: "row" },
          }}
        >
          <Box>
            <Typography variant="h6" fontWeight="bold">
              {title}
            </Typography>
            {subtitle ? (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            ) : null}
          </Box>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {series.map((item) => (
              <Chip
                key={item.key}
                label={item.label}
                size="small"
                sx={{
                  bgcolor: `${item.color}18`,
                  color: item.color,
                  borderColor: `${item.color}55`,
                  borderStyle: "solid",
                  borderWidth: 1,
                }}
              />
            ))}
          </Box>
        </Box>

        <Box sx={{ width: "100%", overflowX: "auto" }}>
          <Box
            component="svg"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            sx={{ width: "100%", minWidth: 360, height: "auto" }}
          >
            {Array.from({ length: 5 }).map((_, index) => {
              const y = padding.top + (innerHeight / 4) * index;
              return (
                <g key={index}>
                  <line
                    x1={padding.left}
                    x2={chartWidth - padding.right}
                    y1={y}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray="4 6"
                  />
                  <text
                    x={padding.left - 10}
                    y={y + 4}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="11"
                  >
                    {valueFormatter(
                      maxValue - ((maxValue - minValue) / 4) * index,
                    )}
                  </text>
                </g>
              );
            })}

            {series.map((item) => (
              <path
                key={item.key}
                d={buildPath(item.key)}
                fill="none"
                stroke={item.color}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {compactPoints.map((point, index) => {
              const x = padding.left + (index / xDenominator) * innerWidth;
              return (
                <text
                  key={point.timestamp}
                  x={x}
                  y={chartHeight - 16}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="11"
                >
                  {chartLabels.includes(point)
                    ? formatAxisLabel(point.timestamp)
                    : ""}
                </text>
              );
            })}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
