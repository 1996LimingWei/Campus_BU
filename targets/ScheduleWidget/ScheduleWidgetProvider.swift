import Foundation
import WidgetKit

struct ScheduleWidgetClass: Codable, Identifiable {
    let id: String
    let title: String
    let courseCode: String?
    let room: String?
    let dayOfWeek: Int
    let startTime: String?
    let endTime: String?
    let startPeriod: Int?
    let endPeriod: Int?
}

struct ScheduleWidgetEntry: TimelineEntry {
    let date: Date
    let nextClass: ScheduleWidgetClass?
    let todayClasses: [ScheduleWidgetClass]
}

struct ScheduleWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> ScheduleWidgetEntry {
        ScheduleWidgetEntry(
            date: Date(),
            nextClass: ScheduleWidgetClass(
                id: "preview-1",
                title: "COMP 1010",
                courseCode: "COMP1010",
                room: "CYT 101",
                dayOfWeek: 1,
                startTime: "09:00",
                endTime: "09:50",
                startPeriod: nil,
                endPeriod: nil
            ),
            todayClasses: [
                ScheduleWidgetClass(
                    id: "preview-1",
                    title: "COMP 1010",
                    courseCode: "COMP1010",
                    room: "CYT 101",
                    dayOfWeek: 1,
                    startTime: "09:00",
                    endTime: "09:50",
                    startPeriod: nil,
                    endPeriod: nil
                ),
                ScheduleWidgetClass(
                    id: "preview-2",
                    title: "MATH 1003",
                    courseCode: "MATH1003",
                    room: "AAB 201",
                    dayOfWeek: 1,
                    startTime: "11:00",
                    endTime: "11:50",
                    startPeriod: nil,
                    endPeriod: nil
                )
            ]
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (ScheduleWidgetEntry) -> Void) {
        completion(buildEntry(at: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ScheduleWidgetEntry>) -> Void) {
        let now = Date()
        let entry = buildEntry(at: now)
        let refresh = nextRefreshDate(from: now)
        let timeline = Timeline(entries: [entry], policy: .after(refresh))
        completion(timeline)
    }

    private func buildEntry(at date: Date) -> ScheduleWidgetEntry {
        let classes = loadClasses()
        let today = upcomingClassesForToday(classes, date: date)
        let nextClass = findNextClass(classes, from: date)
        return ScheduleWidgetEntry(date: date, nextClass: nextClass, todayClasses: today)
    }

    private func loadClasses() -> [ScheduleWidgetClass] {
        guard let defaults = UserDefaults(suiteName: "group.com.budev.HKCampus") else {
            return []
        }

        if let raw = defaults.array(forKey: "hkcampus_schedule_entries") as? [[String: Any]] {
            return decodeClassArray(from: raw)
        }

        if let rawString = defaults.string(forKey: "hkcampus_schedule_entries"),
           let data = rawString.data(using: .utf8),
           let raw = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            return decodeClassArray(from: raw)
        }

        return []
    }

    private func decodeClassArray(from raw: [[String: Any]]) -> [ScheduleWidgetClass] {
        raw.compactMap { item in
            guard let data = try? JSONSerialization.data(withJSONObject: item) else {
                return nil
            }
            return try? JSONDecoder().decode(ScheduleWidgetClass.self, from: data)
        }
    }

    private func upcomingClassesForToday(_ classes: [ScheduleWidgetClass], date: Date) -> [ScheduleWidgetClass] {
        let today = appWeekday(for: date)
        let currentMinutes = minutesFromMidnight(for: date)
        return classes
            .filter { classItem in
                guard classItem.dayOfWeek == today,
                      let start = classItem.startTime else {
                    return false
                }
                return parseMinutes(start) > currentMinutes
            }
            .sorted(by: sortByTime)
    }

    private func findNextClass(_ classes: [ScheduleWidgetClass], from date: Date) -> ScheduleWidgetClass? {
        let calendar = Calendar.current
        let currentMinutes = minutesFromMidnight(for: date)

        for dayOffset in 0...6 {
            guard let targetDate = calendar.date(byAdding: .day, value: dayOffset, to: date) else {
                continue
            }
            let weekday = appWeekday(for: targetDate)
            let dayClasses = classes
                .filter { $0.dayOfWeek == weekday }
                .sorted(by: sortByTime)

            if dayOffset == 0 {
                if let todayNext = dayClasses.first(where: { classItem in
                    guard let start = classItem.startTime else { return false }
                    return parseMinutes(start) > currentMinutes
                }) {
                    return todayNext
                }
            } else if let first = dayClasses.first {
                return first
            }
        }

        return nil
    }

    private func appWeekday(for date: Date) -> Int {
        let weekday = Calendar.current.component(.weekday, from: date)
        return weekday == 1 ? 7 : weekday - 1
    }

    private func minutesFromMidnight(for date: Date) -> Int {
        let components = Calendar.current.dateComponents([.hour, .minute], from: date)
        return (components.hour ?? 0) * 60 + (components.minute ?? 0)
    }

    private func parseMinutes(_ value: String) -> Int {
        let parts = value.split(separator: ":")
        guard parts.count == 2,
              let hours = Int(parts[0]),
              let minutes = Int(parts[1]) else {
            return Int.max
        }
        return (hours * 60) + minutes
    }

    private func sortByTime(lhs: ScheduleWidgetClass, rhs: ScheduleWidgetClass) -> Bool {
        let left = parseMinutes(lhs.startTime ?? "99:99")
        let right = parseMinutes(rhs.startTime ?? "99:99")
        if left == right {
            return lhs.title < rhs.title
        }
        return left < right
    }

    private func nextRefreshDate(from date: Date) -> Date {
        let calendar = Calendar.current
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: date) ?? date
        let midnight = calendar.startOfDay(for: tomorrow)
        let nextClassStart = nextClassStartDate(from: date)
        return min(nextClassStart ?? midnight, midnight)
    }

    private func nextClassStartDate(from date: Date) -> Date? {
        let calendar = Calendar.current
        let classes = loadClasses()
        let currentMinutes = minutesFromMidnight(for: date)

        for dayOffset in 0...6 {
            guard let targetDate = calendar.date(byAdding: .day, value: dayOffset, to: date) else {
                continue
            }
            let weekday = appWeekday(for: targetDate)
            let dayClasses = classes
                .filter { $0.dayOfWeek == weekday }
                .sorted(by: sortByTime)

            for classItem in dayClasses {
                guard let start = classItem.startTime else {
                    continue
                }

                let startMinutes = parseMinutes(start)
                if dayOffset == 0 && startMinutes <= currentMinutes {
                    continue
                }

                var components = calendar.dateComponents([.year, .month, .day], from: targetDate)
                components.hour = startMinutes / 60
                components.minute = startMinutes % 60
                components.second = 0
                return calendar.date(from: components)
            }
        }

        return nil
    }
}
