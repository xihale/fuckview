import { getCourseList } from "../api/getCourseList";
import { setCourseSelection } from "../api/config";
import type { CourseOption } from "../types/course";

function printCourse(course: CourseOption, index: number): void {
    const term = course.termName ? ` | ${course.termName}` : "";
    const id = course.courseId === undefined ? "" : ` courseId=${course.courseId}`;
    console.log(
        `  ${index + 1}. ${course.courseName}${term} (schemeId=${course.schemeId}, classId=${course.classId}${id})`,
    );
}

export async function listCourses(): Promise<CourseOption[]> {
    const courses = await getCourseList();
    if (courses.length === 0) {
        console.log("没有找到可用课程。请确认 AnyView token/cookie 有效。");
        return courses;
    }
    console.log(`可用课程 ${courses.length} 门:`);
    courses.forEach(printCourse);
    return courses;
}

export async function selectCourse(selector: string): Promise<CourseOption> {
    const courses = await getCourseList();
    if (courses.length === 0) throw new Error("课程列表为空，无法选择课程");
    const index = Number(selector);
    let selected = Number.isInteger(index) && index >= 1 && index <= courses.length
        ? courses[index - 1]
        : courses.find((course) =>
            String(course.courseId ?? "") === selector ||
            String(course.schemeId) === selector ||
            course.courseName === selector,
        );
    if (!selected) {
        const keyword = selector.toLocaleLowerCase();
        const fuzzy = courses.filter((course) =>
            course.courseName.toLocaleLowerCase().includes(keyword),
        );
        if (fuzzy.length === 1) selected = fuzzy[0];
    }
    if (!selected) {
        courses.forEach(printCourse);
        throw new Error(`找不到课程 ${selector}（可用序号、courseId、schemeId 或完整名称）`);
    }
    setCourseSelection(selected);
    console.log(`已选择课程: ${selected.courseName} (schemeId=${selected.schemeId}, classId=${selected.classId})`);
    return selected;
}
