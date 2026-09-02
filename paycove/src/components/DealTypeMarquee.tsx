"use client";

import { DEAL_TYPES } from "@/lib/constants";
import { DEAL_COLORS, DEAL_ICON_MAP } from "@/lib/deal-icons";

export function DealTypeMarquee() {
  const dealTypes = [...Object.values(DEAL_TYPES), ...Object.values(DEAL_TYPES)];

  return (
    <div className="deal-marquee -mx-5 overflow-hidden py-2">
      <div className="deal-marquee-track flex gap-3 px-5">
        {dealTypes.map((type, i) => {
          const Icon = DEAL_ICON_MAP[type.id];
          return (
            <div
              key={`${type.id}-${i}`}
              className={`marquee-card flex w-[130px] shrink-0 flex-col rounded-[20px] border border-white/8 bg-gradient-to-br p-4 ${DEAL_COLORS[type.id]}`}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                <Icon className="h-4 w-4 text-white/80" />
              </div>
              <p className="mt-3 text-[12px] font-semibold leading-tight">{type.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
