internal import ExpoModulesCore
import WidgetKit

class WidgetRefreshModule: Module {
    public func definition() -> ModuleDefinition {
        Name("WidgetRefreshModule")

        AsyncFunction("reloadTimelines") { (kind: String) in
            WidgetCenter.shared.reloadTimelines(ofKind: kind)
        }

        AsyncFunction("reloadAllTimelines") {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}
