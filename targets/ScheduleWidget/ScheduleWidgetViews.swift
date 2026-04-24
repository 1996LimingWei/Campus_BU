import Foundation
import SwiftUI
import WidgetKit

struct SmallWidgetView: View {
    let entry: ScheduleWidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Next")
                .font(.caption2)
                .fontWeight(.semibold)
                .foregroundStyle(.white.opacity(0.78))
                .textCase(.uppercase)

            Spacer(minLength: 8)

            if let next = entry.nextClass {
                Text(courseLabel(for: next))
                    .font(.system(size: 25, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.72)
                    .fixedSize(horizontal: false, vertical: true)

                Text(timeRange(for: next))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white.opacity(0.92))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .padding(.top, 8)

                if let room = compactRoomLabel(for: next.room, maxRooms: 1, maxCharacters: 18, includeOverflowCount: false) {
                    Text(room)
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundStyle(.white.opacity(0.82))
                        .lineLimit(1)
                        .minimumScaleFactor(0.82)
                        .padding(.top, 5)
                }
            } else {
                Text("No upcoming class")
                    .font(.system(size: 22, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.76)
            }

            Spacer(minLength: 0)
        }
        .padding(15)
        .containerBackground(for: .widget) {
            SmallWidgetBackground()
        }
    }

    private func timeRange(for item: ScheduleWidgetClass) -> String {
        let start = displayTime(item.startTime)
        let end = displayTime(item.endTime)
        return "\(start) - \(end)"
    }

    private func courseLabel(for item: ScheduleWidgetClass) -> String {
        if let courseCode = item.courseCode, !courseCode.isEmpty {
            return courseCode
        }
        return item.title
    }

}

struct MediumWidgetView: View {
    let entry: ScheduleWidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("Today")
                    .font(.system(size: 18, weight: .heavy, design: .rounded))
                    .foregroundStyle(WidgetPalette.ink)

                Spacer(minLength: 8)

                Text("Next 2")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(WidgetPalette.subtle)
                    .textCase(.uppercase)
            }

            if entry.todayClasses.isEmpty {
                Spacer(minLength: 4)

                Text("No more classes today")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundStyle(WidgetPalette.ink)
                    .lineLimit(2)
                    .minimumScaleFactor(0.78)

                Spacer(minLength: 0)
            } else {
                VStack(spacing: 8) {
                    ForEach(Array(entry.todayClasses.prefix(2))) { item in
                        MediumClassRow(item: item)
                    }
                }
            }

            Spacer(minLength: 0)
        }
        .padding(14)
        .containerBackground(for: .widget) {
            MediumWidgetBackground()
        }
    }
}

private struct MediumClassRow: View {
    let item: ScheduleWidgetClass

    var body: some View {
        HStack(alignment: .center, spacing: 11) {
            VStack(spacing: 2) {
                Text(displayTime(item.startTime))
                    .font(.system(size: 14, weight: .heavy, design: .rounded))
                    .foregroundStyle(WidgetPalette.blue)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)

                Text(displayTime(item.endTime))
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(WidgetPalette.subtle)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)
            }
            .frame(width: 49, minHeight: 46)
            .padding(.vertical, 6)
            .background(WidgetPalette.timeBlock)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(courseLabel)
                    .font(.system(size: 20, weight: .heavy, design: .rounded))
                    .foregroundStyle(WidgetPalette.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)

                if let room = roomLabel {
                    Text(room)
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundStyle(WidgetPalette.subtle)
                        .lineLimit(2)
                        .minimumScaleFactor(0.78)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(.white.opacity(0.68))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var courseLabel: String {
        if let courseCode = item.courseCode, !courseCode.isEmpty {
            return courseCode
        }
        return item.title
    }

    private var roomLabel: String? {
        compactRoomLabel(for: item.room, maxRooms: 2, maxCharacters: 30, includeOverflowCount: true)
    }
}

private struct SmallWidgetBackground: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(red: 0.05, green: 0.17, blue: 0.41),
                Color(red: 0.07, green: 0.30, blue: 0.66),
                Color(red: 0.10, green: 0.45, blue: 0.78)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

private struct MediumWidgetBackground: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(red: 0.95, green: 0.98, blue: 1.0),
                Color(red: 0.88, green: 0.94, blue: 0.99),
                Color(red: 0.93, green: 0.97, blue: 0.95)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

private enum WidgetPalette {
    static let ink = Color(red: 0.05, green: 0.13, blue: 0.30)
    static let blue = Color(red: 0.08, green: 0.28, blue: 0.67)
    static let subtle = Color(red: 0.34, green: 0.43, blue: 0.55)
    static let timeBlock = Color(red: 0.88, green: 0.94, blue: 1.0)
}

private func displayTime(_ value: String?) -> String {
    guard let value, !value.isEmpty else {
        return "--:--"
    }

    let parts = value.split(separator: ":")
    guard parts.count >= 2 else {
        return value
    }

    return "\(parts[0]):\(parts[1])"
}

private func compactRoomLabel(
    for value: String?,
    maxRooms: Int,
    maxCharacters: Int,
    includeOverflowCount: Bool
) -> String? {
    guard let value else {
        return nil
    }

    let rooms = value
        .split(separator: ",")
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }

    guard !rooms.isEmpty else {
        return nil
    }

    let visibleRooms = Array(rooms.prefix(maxRooms))
    var label = visibleRooms.joined(separator: ", ")

    if includeOverflowCount && rooms.count > visibleRooms.count {
        label += " +\(rooms.count - visibleRooms.count)"
    }

    if label.count > maxCharacters {
        return rooms.first.flatMap { $0.count <= maxCharacters ? $0 : nil }
    }

    if !includeOverflowCount && rooms.count > visibleRooms.count {
        return nil
    }

    return label
}
