"use client";

import { defineRegistry, useActions, useBoundProp } from "@json-render/react";
import { shadcnComponents } from "@json-render/shadcn";
import {
  AlertTriangleIcon,
  CheckIcon,
  InfoIcon,
  LightbulbIcon,
  MinusIcon,
  StarIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  XIcon,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Legend,
  Line,
  Pie,
  BarChart as RechartsBarChart,
  LineChart as RechartsLineChart,
  PieChart as RechartsPieChart,
  XAxis,
} from "recharts";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { uiCatalog } from "./catalog";

// React implementations for lib/ui/catalog.ts. Chart and input pieces are
// adapted from json-render's chat example; composites are ours.

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

type Row = Record<string, unknown>;

function rows(data: unknown): Row[] {
  if (Array.isArray(data)) {
    return data as Row[];
  }
  const inner = (data as { data?: unknown } | null)?.data;
  return Array.isArray(inner) ? (inner as Row[]) : [];
}

function num(value: unknown): number {
  return typeof value === "number"
    ? value
    : Number.parseFloat(String(value)) || 0;
}

function Empty({ text = "No data" }: { text?: string }) {
  return (
    <div className="py-4 text-center text-muted-foreground text-sm">{text}</div>
  );
}

function Inline({ text, className }: { text: string; className?: string }) {
  return (
    <Streamdown className={cn("[&>p]:m-0", className)} mode="static">
      {text}
    </Streamdown>
  );
}

// Where `reply` actions go. The chat sets this once it can send messages, so
// pieces rendered anywhere (thread or stage) reach the same conversation.
let replySink: ((text: string) => void) | null = null;

export function setReplySink(sink: ((text: string) => void) | null) {
  replySink = sink;
}

export const { registry } = defineRegistry(uiCatalog, {
  actions: {
    reply: async (params) => {
      const text = params?.text?.trim();
      if (text) {
        replySink?.(text);
      }
    },
  },
  components: {
    Stack: shadcnComponents.Stack,
    Grid: shadcnComponents.Grid,
    Card: shadcnComponents.Card,
    Separator: shadcnComponents.Separator,
    Heading: shadcnComponents.Heading,
    Badge: shadcnComponents.Badge,
    Accordion: shadcnComponents.Accordion,
    Table: shadcnComponents.Table,

    Text: ({ props }) => (
      <Inline
        className={cn(
          "text-sm leading-relaxed",
          props.muted && "text-muted-foreground",
        )}
        text={props.content}
      />
    ),

    Link: ({ props }) => (
      <a
        className="text-primary underline underline-offset-4 hover:text-primary/80"
        href={props.href}
        rel="noopener noreferrer"
        target="_blank"
      >
        {props.text}
      </a>
    ),

    Callout: ({ props }) => {
      const styles = {
        info: {
          Icon: InfoIcon,
          border: "border-l-blue-500",
          bg: "bg-blue-500/5",
          icon: "text-blue-500",
        },
        tip: {
          Icon: LightbulbIcon,
          border: "border-l-emerald-500",
          bg: "bg-emerald-500/5",
          icon: "text-emerald-500",
        },
        warning: {
          Icon: AlertTriangleIcon,
          border: "border-l-amber-500",
          bg: "bg-amber-500/5",
          icon: "text-amber-500",
        },
        important: {
          Icon: StarIcon,
          border: "border-l-purple-500",
          bg: "bg-purple-500/5",
          icon: "text-purple-500",
        },
      };
      const s = styles[props.type ?? "info"] ?? styles.info;
      return (
        <div className={cn("rounded-r-lg border-l-4 p-4", s.border, s.bg)}>
          <div className="flex items-start gap-3">
            <s.Icon className={cn("mt-0.5 size-5 shrink-0", s.icon)} />
            <div className="min-w-0 flex-1">
              {props.title && (
                <p className="mb-1 font-semibold text-sm">{props.title}</p>
              )}
              <Inline
                className="text-muted-foreground text-sm"
                text={props.content}
              />
            </div>
          </div>
        </div>
      );
    },

    Metric: ({ props }) => {
      const TrendIcon =
        props.trend === "up"
          ? TrendingUpIcon
          : props.trend === "down"
            ? TrendingDownIcon
            : MinusIcon;
      const trendColor =
        props.trend === "up"
          ? "text-emerald-500"
          : props.trend === "down"
            ? "text-red-500"
            : "text-muted-foreground";
      return (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">{props.label}</p>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-2xl tracking-tight">
              {props.value}
            </span>
            {props.trend && <TrendIcon className={cn("size-4", trendColor)} />}
          </div>
          {props.detail && (
            <p className="text-muted-foreground text-xs">{props.detail}</p>
          )}
        </div>
      );
    },

    Timeline: ({ props }) => (
      <div className="relative pl-8">
        <div className="absolute top-3 bottom-3 left-[5.5px] w-px bg-border" />
        <div className="flex flex-col gap-6">
          {(props.items ?? []).map((item, i) => {
            const dot =
              item.status === "completed"
                ? "bg-emerald-500"
                : item.status === "current"
                  ? "bg-blue-500"
                  : "bg-muted-foreground/30";
            return (
              <div className="relative" key={`${item.title}-${i}`}>
                <div
                  className={cn(
                    "-left-8 absolute top-0.5 size-3 rounded-full ring-2 ring-background",
                    dot,
                  )}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-sm">{item.title}</p>
                  {item.date && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
                      {item.date}
                    </span>
                  )}
                </div>
                {item.description && (
                  <Inline
                    className="mt-1 text-muted-foreground text-sm"
                    text={item.description}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    ),

    BarChart: ({ props }) => {
      const items = rows(props.data).map((r) => ({
        ...r,
        label: String(r[props.xKey] ?? ""),
      }));
      if (items.length === 0) {
        return <Empty />;
      }
      const config = {
        [props.yKey]: {
          label: props.yKey,
          color: props.color ?? "var(--chart-1)",
        },
      } satisfies ChartConfig;
      return (
        <div className="w-full">
          {props.title && (
            <p className="mb-2 font-medium text-sm">{props.title}</p>
          )}
          <ChartContainer
            className="min-h-[200px] w-full"
            config={config}
            style={{ height: props.height ?? 260 }}
          >
            <RechartsBarChart accessibilityLayer data={items}>
              <CartesianGrid vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="label"
                tickLine={false}
                tickMargin={10}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey={props.yKey}
                fill={`var(--color-${props.yKey})`}
                radius={4}
              />
            </RechartsBarChart>
          </ChartContainer>
        </div>
      );
    },

    LineChart: ({ props }) => {
      const items = rows(props.data).map((r) => ({
        ...r,
        label: String(r[props.xKey] ?? ""),
      }));
      if (items.length === 0) {
        return <Empty />;
      }
      const config = {
        [props.yKey]: {
          label: props.yKey,
          color: props.color ?? "var(--chart-1)",
        },
      } satisfies ChartConfig;
      return (
        <div className="w-full">
          {props.title && (
            <p className="mb-2 font-medium text-sm">{props.title}</p>
          )}
          <ChartContainer
            className="min-h-[200px] w-full [&_svg]:overflow-visible"
            config={config}
            style={{ height: props.height ?? 260 }}
          >
            <RechartsLineChart accessibilityLayer data={items}>
              <CartesianGrid vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="label"
                interval={
                  items.length > 12
                    ? Math.ceil(items.length / 8) - 1
                    : undefined
                }
                tickLine={false}
                tickMargin={10}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                dataKey={props.yKey}
                dot={false}
                stroke={`var(--color-${props.yKey})`}
                strokeWidth={2}
                type="monotone"
              />
            </RechartsLineChart>
          </ChartContainer>
        </div>
      );
    },

    PieChart: ({ props }) => {
      const items = rows(props.data);
      if (items.length === 0) {
        return <Empty />;
      }
      const config: ChartConfig = {};
      const data = items.map((item, i) => {
        const name = String(item[props.nameKey] ?? `Segment ${i + 1}`);
        config[name] = {
          label: name,
          color: CHART_COLORS[i % CHART_COLORS.length],
        };
        return {
          name,
          value: num(item[props.valueKey]),
          fill: CHART_COLORS[i % CHART_COLORS.length],
        };
      });
      return (
        <div className="w-full">
          {props.title && (
            <p className="mb-2 font-medium text-sm">{props.title}</p>
          )}
          <ChartContainer
            className="mx-auto aspect-square w-full"
            config={config}
            style={{ height: props.height ?? 260 }}
          >
            <RechartsPieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie
                data={data}
                dataKey="value"
                innerRadius="40%"
                nameKey="name"
                outerRadius="70%"
                paddingAngle={2}
              />
              <Legend />
            </RechartsPieChart>
          </ChartContainer>
        </div>
      );
    },

    Tabs: ({ props, children }) => (
      <Tabs defaultValue={props.defaultValue ?? props.tabs?.[0]?.value}>
        <TabsList>
          {(props.tabs ?? []).map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {children}
      </Tabs>
    ),

    TabContent: ({ props, children }) => (
      <TabsContent value={props.value}>{children}</TabsContent>
    ),

    RadioGroup: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<string>(
        props.value as string | undefined,
        bindings?.value,
      );
      return (
        <div className="flex flex-col gap-2">
          {props.label && (
            <Label className="font-medium text-sm">{props.label}</Label>
          )}
          <RadioGroup
            onValueChange={(v: string) => setValue(v)}
            value={value ?? ""}
          >
            {(props.options ?? []).map((opt) => (
              <div className="flex items-center gap-2" key={opt.value}>
                <RadioGroupItem id={`rg-${opt.value}`} value={opt.value} />
                <Label
                  className="cursor-pointer font-normal"
                  htmlFor={`rg-${opt.value}`}
                >
                  {opt.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      );
    },

    SelectInput: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<string>(
        props.value as string | undefined,
        bindings?.value,
      );
      return (
        <div className="flex flex-col gap-2">
          {props.label && (
            <Label className="font-medium text-sm">{props.label}</Label>
          )}
          <Select
            onValueChange={(v: string) => setValue(v)}
            value={value ?? ""}
          >
            <SelectTrigger>
              <SelectValue placeholder={props.placeholder ?? "Select…"} />
            </SelectTrigger>
            <SelectContent>
              {(props.options ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    },

    TextInput: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<string>(
        props.value as string | undefined,
        bindings?.value,
      );
      return (
        <div className="flex flex-col gap-2">
          {props.label && (
            <Label className="font-medium text-sm">{props.label}</Label>
          )}
          <Input
            onChange={(e) => setValue(e.target.value)}
            placeholder={props.placeholder ?? ""}
            type={props.type ?? "text"}
            value={value ?? ""}
          />
        </div>
      );
    },

    Button: ({ props, emit }) => (
      <Button
        onClick={() => emit("press")}
        size={props.size ?? "default"}
        variant={props.variant ?? "default"}
      >
        {props.label}
      </Button>
    ),

    // --- composites --------------------------------------------------------
    KeyFacts: ({ props }) => (
      <div className="rounded-lg border">
        {props.title && (
          <p className="border-b px-4 py-2 font-medium text-sm">
            {props.title}
          </p>
        )}
        <dl className="divide-y">
          {(props.facts ?? []).map((f, i) => (
            <div
              className="grid grid-cols-[minmax(7rem,1fr)_2fr] gap-3 px-4 py-2 text-sm"
              key={`${f.label}-${i}`}
            >
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd>
                <Inline text={f.value} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    ),

    Steps: ({ props }) => (
      <div>
        {props.title && (
          <p className="mb-3 font-medium text-sm">{props.title}</p>
        )}
        <ol className="flex flex-col gap-3">
          {(props.steps ?? []).map((s, i) => (
            <li className="flex gap-3" key={`${s.title}-${i}`}>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary font-medium text-xs tabular-nums">
                {i + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="font-medium text-sm">{s.title}</p>
                {s.detail && (
                  <Inline
                    className="text-muted-foreground text-sm"
                    text={s.detail}
                  />
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    ),

    Compare: ({ props }) => {
      const options = props.options ?? [];
      return (
        <div className="w-full">
          {props.title && (
            <p className="mb-2 font-medium text-sm">{props.title}</p>
          )}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="w-36 px-3 py-2 text-left font-medium text-muted-foreground">
                    &nbsp;
                  </th>
                  {options.map((o) => (
                    <th className="px-3 py-2 text-left font-semibold" key={o}>
                      {o}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {(props.rows ?? []).map((row, i) => (
                  <tr key={`${row.attribute}-${i}`}>
                    <th
                      className="px-3 py-2 text-left font-medium text-muted-foreground align-top"
                      scope="row"
                    >
                      {row.attribute}
                    </th>
                    {options.map((o, j) => (
                      <td className="px-3 py-2 align-top" key={o}>
                        <Inline text={row.values?.[j] ?? ""} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {props.verdict && (
            <p className="mt-2 text-sm">
              <span className="font-medium">Bottom line: </span>
              {props.verdict}
            </p>
          )}
        </div>
      );
    },

    ProsCons: ({ props }) => (
      <div>
        {props.title && (
          <p className="mb-2 font-medium text-sm">{props.title}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <ul className="flex flex-col gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
            {(props.pros ?? []).map((p) => (
              <li className="flex gap-2" key={p}>
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                <Inline text={p} />
              </li>
            ))}
          </ul>
          <ul className="flex flex-col gap-1.5 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm">
            {(props.cons ?? []).map((c) => (
              <li className="flex gap-2" key={c}>
                <XIcon className="mt-0.5 size-4 shrink-0 text-red-500" />
                <Inline text={c} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    ),

    Itinerary: ({ props }) => (
      <div className="flex flex-col gap-4">
        {props.title && <p className="font-medium text-sm">{props.title}</p>}
        {(props.days ?? []).map((day, i) => (
          <div className="rounded-lg border" key={`${day.label}-${i}`}>
            <div className="flex flex-wrap items-baseline gap-2 border-b bg-muted/40 px-4 py-2">
              <span className="font-semibold text-sm">{day.label}</span>
              {day.theme && (
                <span className="text-muted-foreground text-xs">
                  {day.theme}
                </span>
              )}
            </div>
            <ul className="divide-y">
              {(day.slots ?? []).map((slot, j) => (
                <li
                  className="grid grid-cols-[5.5rem_1fr] gap-3 px-4 py-2 text-sm"
                  key={`${slot.activity}-${j}`}
                >
                  <span className="text-muted-foreground tabular-nums">
                    {slot.time ?? ""}
                  </span>
                  <div>
                    <Inline text={slot.activity} />
                    {slot.note && (
                      <p className="text-muted-foreground text-xs">
                        {slot.note}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    ),

    Choices: ({ props }) => (
      <ChoicesButtons choices={props.choices ?? []} prompt={props.prompt} />
    ),
  },
});

// Choices sends its reply through the same `reply` action the catalog
// declares, so the wiring lives in one place (see ui-render.tsx).
function ChoicesButtons({
  prompt,
  choices,
}: {
  prompt: string | null;
  choices: { label: string; reply: string }[];
}) {
  const { execute } = useActions();
  return (
    <div className="flex flex-col gap-2">
      {prompt && <p className="text-sm">{prompt}</p>}
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => (
          <Button
            key={c.label}
            onClick={() =>
              execute({ action: "reply", params: { text: c.reply } })
            }
            size="sm"
            variant="outline"
          >
            {c.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function Fallback({ type }: { type: string }) {
  return (
    <div className="rounded-lg border border-dashed p-3 text-muted-foreground text-xs">
      Unknown component: {type}
    </div>
  );
}
