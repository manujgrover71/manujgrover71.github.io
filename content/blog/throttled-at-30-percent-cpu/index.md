---
title: "Throttled at 30% CPU"
date: 2026-10-20T12:00:00+05:30
slug: "throttled-at-30-percent-cpu"
# One or two sentences. Shown in RSS and as the meta description.
summary: "A container limit is enforced every 100 ms, not every minute. A service averaging 30% CPU can still spend most of each period stalled, and your dashboard will never show it."
tags: [ecs, containers, linux, go]
image: ""
draft: true
---

<!--
WORKING NOTES (delete before publishing)

Title options:
  1. Throttled at 30% CPU             <- current pick: the contradiction is the hook
  2. Your CPU Average Is Lying
  3. Where a Container's CPU Goes

Thesis: the CFS quota is a budget per 100 ms period. A 1 vCPU task running 8 threads can spend the
whole 100 ms budget in 12.5 ms of wall time, then stall for 87.5 ms. CloudWatch averages over a
minute, so it shows 30% while p99 shows the stalls. Source: the internal ECS talk; this post adds
the measurements.

ECS-specific angle (the gap nobody covers; most posts are Kubernetes). Scope: ECS on EC2 only, no Fargate.
- Task-level `cpu` is a hard limit (CFS quota). Container-level `cpu` is cpu.shares, a soft weight,
  unless the task has a task-level limit. Verify both in the lab.
- What GOMAXPROCS / nproc a Go process sees inside a task on a large EC2 host. VERIFY on a real task.
- Where to read throttling on ECS: task metadata endpoint v4 /stats (docker stats format,
  cpu_stats.throttling_data), Container Insights. VERIFY which fields are populated.

Go angle: before Go 1.25, GOMAXPROCS = host cores (16 Ps in a 1 vCPU task on a 16-core EC2 host),
and GC background marking takes 25% of GOMAXPROCS, so GC cycles burn quota in bursts.
Go 1.25 reads the cgroup CPU limit. automaxprocs did this before. Clear before/after.

Link to the HTTP client post: connection churn = TLS handshakes in bursts = quota burned in bursts.
-->

## Background

<!-- The talk, the question people asked: "average CPU is 30%, why are we throttled?" -->

## A limit you pay every 100 milliseconds

<!-- CFS bandwidth control: cpu.max (v2) = quota period. Diagram: 100 ms periods, 8 threads burn
     the budget in 12.5 ms, then flat until the next period. -->

## Why the average can't see it

<!-- Experiment 1 chart: the same run at 10 ms, 1 s and 1 min resolution. 30% vs 100%-then-0%. -->

## Where it shows up instead

<!-- cpu.stat: nr_periods, nr_throttled, throttled_usec. Throttle ratio = nr_throttled / nr_periods.
     How to read it on ECS (metadata endpoint, Container Insights). -->

## What ECS actually limits

<!-- Task cpu (hard quota) vs container cpu (shares only), and what happens when a neighbour task is busy. Experiment 4 results. -->

## Go makes it worse (until 1.25)

<!-- GOMAXPROCS = host cores, GC workers, parallel bursts. Experiment 2: GOMAXPROCS host vs limit vs Go 1.25 default. -->

## Bursts, not load, decide it

<!-- Experiment 3: same average CPU, different burst shapes (steady vs fan-out vs GC-heavy vs TLS handshakes). -->

## What I'd set

<!-- Table: Go >= 1.25 (or automaxprocs), task cpu sized for bursts not averages, alert on throttle
     ratio not CPU%, consider no hard limit on EC2 with shares only, cpu-period trade-offs. -->

## How this was measured

<!--
LAB: cpu-throttle-lab
- Docker on a multi-core machine, `--cpus=1` (sets cpu.max quota), Go service with a configurable workload:
  steady spin, bursty fan-out (N goroutines for X ms every Y ms), allocation-heavy (GC), TLS handshakes.
- A sidecar sampler reading /sys/fs/cgroup/cpu.stat and cpu usage every 10 ms.
- Open-loop requests against the service for p50/p99.
Experiments:
  1. Same run plotted at 10 ms / 1 s / 1 min                         (the headline chart)
  2. GOMAXPROCS = host cores vs = limit vs Go 1.25 default            (throttle ratio, p99)
  3. Equal average CPU, four burst shapes                             (bursts decide throttling)
  4. Real ECS on EC2: task cpu vs container cpu only, alone and next to a busy neighbour task.
     Record GOMAXPROCS, nproc, cpu.max, cpu.weight, and whether throttling stats appear.
                                                                      (the ECS-specific section)
  5. Optional: --cpu-period 100ms vs 10ms vs no limit                 (what the knob trades)
Real ECS runs cost a little AWS money; one multi-core EC2 container instance for a few hours should be enough.
-->
