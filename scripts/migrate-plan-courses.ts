#!/usr/bin/env node

/**
 * Migration: courses.planId → planCourses junction table
 *
 * THIS MIGRATION HAS ALREADY BEEN RUN (2026-05-12).
 * The courses.planId column has been removed from the schema.
 * This script is kept for historical reference only.
 *
 * Original behavior:
 *   Read all courses with a planId and insert corresponding
 *   rows into the planCourses junction table.
 */

console.log("[migrate] This migration has already been completed. No action needed.");
console.log("[migrate] courses.planId column has been removed from schema.");
