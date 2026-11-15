import { router } from "expo-router";
import type { Person, Recipe, RecipeSummary, Service, ShoppingList } from "@feedr/core";
import { addDays, monday, shortDate, today, weekRange } from "../dates";
import { joinNames, minutes, num, totalMinutes } from "../format";
import { eaterLine, tonight, useWeek, type Dish } from "../plan";
import {
  ArrowLane,
  Fill,
  Gutter,
  Lane,
  PrimaryButton,
  QueryState,
  Row,
  Screen,
  SectionHeader,
  Text,
  TopBar,
} from "../primitives";
import { useApiQuery } from "../store";
import { useTicks } from "../ticks";

/** Tonight's dinner, with a button straight into cook mode for the version that was planned. */
function Tonight({ dish, solo }: { dish: Dish; solo: boolean }) {
  const service = useApiQuery<Service>(["service", dish.serviceId], `/services/${dish.serviceId}`);
  const recipe = useApiQuery<Recipe>(["recipe", dish.recipeId], `/recipes/${dish.recipeId}`);
  const version = recipe.data?.versions.find((v) => v.id === service.data?.version_id);
  const time = version && totalMinutes(version);
  return (
    <Gutter style={{ paddingBottom: 36 }}>
      <SectionHeader
        ruled
        title="Tonight"
        meta={`Dinner · ${solo ? `${num(dish.eaters[0]?.kcal)} kcal` : eaterLine(dish.eaters)}`}
      />
      <Text variant="featureTitle" style={{ paddingTop: 18 }}>
        {dish.title}
      </Text>
      <Text variant="label" style={{ paddingTop: 6, paddingBottom: 20 }}>
        {version ? [time != null && minutes(time), `Serves ${version.servings}`].filter(Boolean).join(" · ") : " "}
      </Text>
      <PrimaryButton
        label={version ? `Start cooking · ${version.steps.length} steps` : "Start cooking"}
        disabled={!version}
        onPress={() =>
          version &&
          router.push({
            pathname: "/cook/[versionId]",
            params: { versionId: version.id, recipeId: dish.recipeId, serviceId: dish.serviceId },
          })
        }
      />
    </Gutter>
  );
}

function IndexRow({
  number,
  title,
  subline,
  last = false,
  onPress,
}: {
  number: string;
  title: string;
  subline: string;
  last?: boolean;
  onPress: () => void;
}) {
  return (
    <Row pad={16} last={last} onPress={onPress} label={title} role="link">
      <Lane size="number">
        <Text variant="stepNumber" style={{ lineHeight: 32 }}>
          {number}
        </Text>
      </Lane>
      <Fill style={{ gap: 2 }}>
        <Text variant="indexTitle">{title}</Text>
        <Text variant="indexSub">{subline}</Text>
      </Fill>
      <ArrowLane lineHeight={32} />
    </Row>
  );
}

export default function Home() {
  const date = today();
  const start = monday(date);
  const { query: plan, week } = useWeek(start);
  const recipes = useApiQuery<RecipeSummary[]>(["recipes", ""], "/recipes");
  const shopping = useApiQuery<ShoppingList>(["shopping", start], `/shopping?start=${start}&end=${addDays(start, 6)}`);
  const people = useApiQuery<Person[]>(["people"], "/people");
  const { ticked } = useTicks(start);
  const queries = [plan, recipes, shopping, people];

  const dish = week && tonight(week, date);
  const items = shopping.data?.items;
  const tickedCount = items?.filter((i) => ticked.includes(i.ingredient_id)).length;
  const left = week?.mealsLeft;

  return (
    <Screen
      refreshing={queries.some((q) => q.isRefetching)}
      onRefresh={() => queries.forEach((q) => void q.refetch())}
    >
      <TopBar left={<Text variant="label">{shortDate(date)}</Text>} />
      <QueryState query={plan} />
      {dish && week && <Tonight key={dish.serviceId} dish={dish} solo={week.people.length < 2} />}
      <Gutter>
        <IndexRow
          number="01"
          title="Meal plan"
          subline={[
            weekRange(start),
            left == null ? null : left ? `${left} ${left === 1 ? "meal" : "meals"} to plan` : "All meals planned",
          ]
            .filter(Boolean)
            .join(" · ")}
          onPress={() => router.push("/plan")}
        />
        <IndexRow
          number="02"
          title="Cookbook"
          subline={recipes.data ? `${recipes.data.length} ${recipes.data.length === 1 ? "recipe" : "recipes"}` : " "}
          onPress={() => router.push("/cookbook")}
        />
        <IndexRow
          number="03"
          title="Shopping list"
          subline={items ? `${items.length} ${items.length === 1 ? "item" : "items"} · ${tickedCount} ticked` : " "}
          onPress={() => router.push("/shopping")}
        />
        <IndexRow
          number="04"
          title="People"
          subline={people.data ? joinNames(people.data.map((p) => p.name)) || "Add who you cook for" : " "}
          last
          onPress={() => router.push("/people")}
        />
      </Gutter>
    </Screen>
  );
}
