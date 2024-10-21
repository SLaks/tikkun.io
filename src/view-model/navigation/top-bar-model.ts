import {
  LeiningAliyah,
  LeiningInstance,
  LeiningRun,
} from '../../calendar-model/model-types'
import { aliyahName } from '../aliyah-labeller'
import { RenderedLineInfo, ScrollViewModel } from '../scroll-view-model'

/** The information and link targets displayed in the top navigation bar. */
export interface TopBarInfo {
  /**
   * The range of עלייה labels describing the lines on the screen.
   * This may contain:
   *  - 0 elements for a מגילה or הפטרה
   *  - 0 elements, if the screen is entirely before the first עלייה in a run.
   *  - 1 element, if the screen is entirely contained within a single עלייה.
   *    - Or if the screen contains the beginning or end of the run, and no
   *      other עלייה boundaries.
   *  - 2 elements, if there are one or more עלייה boundaries on the sceen.
   */
  aliyahRange: string[]

  /**
   * The run containing the center line.
   * If the center line is not in a run, the run containing any visible line.
   * If the screen is entirely before the first עלייה in a run, this will be null.
   */
  currentRun: LeiningRun | null

  /**
   * The target for the Previous link.
   * This will point to the first run in the instance before `currentRun`.
   * Will be null only if `currentRun` is null.
   */
  previousLink: Link | null
  /**
   * The target for the Next link.
   * This will point to the first run in the instance after `currentRun`.
   * Will be null only if `currentRun` is null.
   */
  nextLink: Link | null

  /**
   * Other runs in the same leining instance as `currentRun`, if any.
   * These will usually be in other scrolls, except for
   * שביעי and מפטיר in HolidayViewModel.
   */
  relatedRuns: Link[]
}

interface Link {
  targetRun: LeiningRun
  /** Will omit context if the same as the current run. */
  label: string
}

interface AliyahReference {
  run: LeiningRun
  aliyah: LeiningAliyah
}

/**
 * Generates a `TopBarInfo` as the user scrolls.
 *
 * This class caches all computed information to minimize work
 * triggered by scroll events.
 *
 * The class state is only used as a cache; it can be reused
 * across ScrollViewModel instances.
 */
export class TopBarTracker {
  private currentInfo: Readonly<TopBarInfo> = {
    aliyahRange: [],
    currentRun: null,
    previousLink: null,
    nextLink: null,
    relatedRuns: [],
  }
  // These are only used as a cache.
  private firstAliyah: AliyahReference | null = null
  private lastAliyah: AliyahReference | null = null

  setLine(
    model: ScrollViewModel,
    lines: {
      first: RenderedLineInfo | null
      center: RenderedLineInfo | null
      last: RenderedLineInfo | null
    }
  ) {
    const newInfo = { ...this.currentInfo }

    const firstAliyah = lines.first?.aliyot[0] ?? lines.center?.aliyot[0]
    const lastAliyah = lines.last?.aliyot[0] ?? lines.center?.aliyot[0]

    const run = lines.center?.run ?? lines.last?.run ?? lines.first?.run
    if (!run) return
    newInfo.currentRun = run

    if (
      newInfo.currentRun !== this.currentInfo.currentRun &&
      newInfo.currentRun
    ) {
      newInfo.relatedRuns = newInfo.currentRun.leining.runs.map((run) => ({
        // Use aliyahName() to turn שביעי into חתן בראשית.
        // Use `run.type` to label הפטרות.
        label: aliyahName(run.aliyot[0].index, run) ?? run.type,
        targetRun: run,
      }))

      const allInstances = model.generator
        .aroundDate(newInfo.currentRun.leining.date.date)
        .flatMap((d) => d.leinings)
      const instanceIndex = allInstances.indexOf(newInfo.currentRun.leining)
      newInfo.previousLink = createInstanceLink(
        allInstances[instanceIndex - 1],
        newInfo.currentRun
      )
      newInfo.nextLink = createInstanceLink(
        allInstances[instanceIndex + 1],
        newInfo.currentRun
      )
    }

    if (newInfo.currentRun?.scroll !== 'torah') {
      // Only חומש has עלייה labels at all.
      newInfo.aliyahRange = []
    } else if (
      // If the עלייה range didn't change, don't recompute.
      firstAliyah !== this.firstAliyah?.aliyah ||
      lastAliyah !== this.lastAliyah?.aliyah
    ) {
      this.firstAliyah = toTuple(firstAliyah)
      this.lastAliyah = toTuple(lastAliyah)
      if (firstAliyah || lastAliyah) {
        newInfo.aliyahRange = this.generateAliyahRange(newInfo.currentRun)
      }

      function toTuple(
        aliyah: LeiningAliyah | undefined
      ): AliyahReference | null {
        if (!aliyah) return null
        return {
          aliyah,
          run: Object.values(lines).find((l) => l?.aliyot.includes(aliyah))!
            .run!,
        }
      }
    }
  }

  private generateAliyahRange(currentRun: LeiningRun): string[] {
    return (
      this.firstAliyah?.aliyah === this.lastAliyah?.aliyah
        ? [this.firstAliyah]
        : [this.firstAliyah, this.lastAliyah]
    )
      .filter((a) => a != null)
      .map((a) => {
        const label = aliyahName(a.aliyah.index, a.run)
        return a.run === currentRun
          ? label
          : `${a.run.leining.date.title} ${label}`
      })
  }
}

function createInstanceLink(
  target: LeiningInstance,
  currentRun: LeiningRun
): Link | null {
  return {
    targetRun: target.runs[0],
    label: [
      target.date.id === currentRun.leining.date.id ? '' : target.date.title,
      target.id,
    ]
      .join(' ')
      .trim(),
  }
}
